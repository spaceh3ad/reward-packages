// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./lib/Errors.sol";
import {Events} from "./lib/Events.sol";

contract RewardPackages {
    /// @dev use safeERC20 for safe ERC20 handling
    using SafeERC20 for IERC20;

    address public owner;
    mapping(address => Package) public tokenToPackageMapping;
    mapping(address => mapping(address => UserDeposit)) public userDeposits;

    /// @dev used for correct rewards calculation
    uint256 DENOMINATOR = 100_000;

    enum RewardRate {
        SECONDLY,
        HOURLY,
        DAILY
    }

    /// @dev struct for storing user deposits data
    struct UserDeposit {
        uint256 amount;
        uint256 timestamp;
    }

    /// @dev struct for staking specs
    struct Package {
        string name;
        bool active;
        uint256 lockTime;
        RewardRate rewardFrequency;
        uint256 rewardPercent; /// @dev precision set up to 0.000001% (uint256: 1)
        uint256 minDeposit;
        uint256 maxDeposit;
    }

    /// @dev restrict functions to be only executable by contract owner
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    /// @dev check if staking is enabled for token
    modifier isPackage(address _token) {
        bytes memory bStr = bytes(tokenToPackageMapping[_token].name);

        if (bStr.length == 0) {
            /// @dev revert if user wants to deposit to non existing package
            revert NoSuchPackage(_token);
        } else if (!tokenToPackageMapping[_token].active) {
            /// @dev revert if user wants to deposit to disabled package
            revert PackageDisabled();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @dev allow adding new packages
    function createPackage(
        address _token,
        Package memory _package
    ) external onlyOwner {
        bytes memory bStr = bytes(_package.name);

        /// @dev make sure package is set to active and has name
        if (!_package.active || bStr.length == 0) {
            revert PackageInvalid(_token);
        }

        tokenToPackageMapping[_token] = _package;
        emit Events.PackageAdded(_token);
    }

    /// @dev disable package
    function disablePackage(address _token) external onlyOwner {
        tokenToPackageMapping[_token].active = false;
        emit Events.PackageDisabled(_token);
    }

    function depositTokens(
        address _token,
        uint256 _amount
    ) external isPackage(_token) {
        if (IERC20(_token).allowance(msg.sender, address(this)) < _amount) {
            /// @dev revert if user didn't approve enough tokens
            revert InsufficientAllowance();
        }

        // make sure they don't deposit less or more then specified in package
        if (
            _amount < tokenToPackageMapping[_token].minDeposit ||
            _amount > tokenToPackageMapping[_token].maxDeposit
        ) {
            revert WrongDepositAmount(_amount);
        }

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        userDeposits[msg.sender][_token] = UserDeposit({
            amount: _amount,
            timestamp: block.timestamp
        });

        emit Events.PackageDeposit(_token, _amount);
    }

    function withdrawTokens(address _token) external {
        /// @dev if user tries to withdraw prior to lock time - revert
        if (tokenToPackageMapping[_token].lockTime > block.timestamp) {
            revert WithdrawLocked();
        }

        uint256 _amount = userDeposits[msg.sender][_token].amount;
        uint256 _depositedAt = userDeposits[msg.sender][_token].timestamp;

        /// @dev remove user record from mapping
        delete userDeposits[msg.sender][_token];

        uint256 _payout = calculateRewards(_token, _amount, _depositedAt);
        IERC20(_token).safeTransfer(msg.sender, _payout);

        emit Events.PackageWithdrawal(_token, _payout);
    }

    /////////////// UTILS /////////////////////////

    /// @dev calculate rewards
    function calculateRewards(
        address _token,
        uint256 _deposit,
        uint256 _depositedAt
    ) internal view returns (uint256) {
        uint256 yieldRate = tokenToPackageMapping[_token].rewardPercent;

        RewardRate rewardRate = tokenToPackageMapping[_token].rewardFrequency;

        uint256 timeDivision;

        if (rewardRate == RewardRate.SECONDLY) {
            timeDivision = 1;
        } else if (rewardRate == RewardRate.HOURLY) {
            timeDivision = 60 minutes;
        } else {
            timeDivision = 1 days;
        }

        uint256 rounds = (block.timestamp - _depositedAt) / timeDivision;
        return (_deposit * yieldRate * rounds) / DENOMINATOR;
    }

    /// @dev return information about user (amount of tokens and rewards)
    function getUserInfo(
        address _user,
        address _package
    ) public view returns (UserDeposit memory, uint256) {
        uint256 _amount = userDeposits[_user][_package].amount;
        uint256 _depositedAt = userDeposits[_user][_package].timestamp;

        uint256 rewards = calculateRewards(_package, _amount, _depositedAt);
        return (userDeposits[_user][_package], rewards);
    }
}
