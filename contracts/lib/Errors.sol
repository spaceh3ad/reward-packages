// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

error Unauthorized();
error InsufficientAllowance();
error NoSuchPackage(address _token);
error WrongDepositAmount(uint256 _amount);
error PackageInvalid(address _package);
error WithdrawLocked();
error PackageDisabled();
