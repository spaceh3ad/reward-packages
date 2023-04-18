// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library Events {
    event PackageAdded(address _package);
    event PackageDisabled(address _package);
    event PackageDeposit(address _package, uint256 _amount);
    event PackageWithdrawal(address _package, uint256 _amount);
}
