import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  MockToken,
  MockToken__factory,
  RewardPackages,
  RewardPackages__factory,
} from "../typechain-types";

import { getPackage, DepositRates, getTimestampIn } from "../scripts/utils";

describe("RewardPackages", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let evil: SignerWithAddress;

  let tokens: Array<MockToken> = [];

  let rewardPackages: RewardPackages;

  beforeEach(async () => {
    [deployer, alice, bob, evil] = await ethers.getSigners();

    rewardPackages = await new RewardPackages__factory(deployer).deploy();

    tokens[0] = await new MockToken__factory(deployer).deploy("TEST1", "T1");
    tokens[1] = await new MockToken__factory(deployer).deploy("TEST2", "T2");

    // top up test accounts with mock tokens
    tokens.forEach((element) => {
      element
        .connect(deployer)
        .transfer(alice.address, ethers.utils.parseEther("2000"));

      element
        .connect(deployer)
        .transfer(bob.address, ethers.utils.parseEther("1000"));
    });
  });

  describe("Validations", function () {
    it("Should revert if create package does not have name", async function () {
      let _package = getPackage(
        "",
        await getTimestampIn(),
        DepositRates.SECONDLY,
        10000,
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("10000")
      );
      expect(
        rewardPackages.createPackage(tokens[0].address, _package)
      ).to.be.revertedWith("PackageInvalid");
    });
    it("Should revert if create package is being called not by the owner", async function () {
      let _package = getPackage(
        "Test",
        await getTimestampIn(),
        DepositRates.SECONDLY,
        10000,
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("10000")
      );
      expect(
        rewardPackages.connect(evil).createPackage(tokens[0].address, _package)
      ).to.be.revertedWith("Unauthorized");
    });
    it("Should revert if create package is being called with active set to false", async function () {
      // prevent creating stale package
      let _package = getPackage(
        "Test",
        await getTimestampIn(),
        DepositRates.SECONDLY,
        10000,
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("10000"),
        false
      );
      expect(
        rewardPackages.createPackage(tokens[0].address, _package)
      ).to.be.revertedWith("PackageInvalid");
    });
    it("Should revert if user wants to deposit to disabled package", async function () {
      await addPackage();
      await rewardPackages.disablePackage(tokens[0].address);

      expect(
        rewardPackages
          .connect(bob)
          .depositTokens(tokens[0].address, ethers.utils.parseEther("100"))
      ).to.be.revertedWith("PackageDisabled");
    });
    it("Should revert if disable package is not being called by the owner", async function () {
      expect(
        rewardPackages.connect(evil).disablePackage(tokens[0].address)
      ).to.be.revertedWith("Unauthorized");
    });
    it("Should revert if user has insufficient allowance", async function () {
      await addPackage();
      expect(
        rewardPackages
          .connect(bob)
          .depositTokens(tokens[0].address, ethers.utils.parseEther("0.01"))
      ).to.be.revertedWith("InsufficientAllowance");
    });
    it("Should revert if user deposits less then minDeposit amount", async function () {
      await addPackage();
      await tokens[0]
        .connect(bob)
        .approve(rewardPackages.address, ethers.utils.parseEther("0.01"));
      expect(
        rewardPackages
          .connect(bob)
          .depositTokens(tokens[0].address, ethers.utils.parseEther("0.01"))
      ).to.be.revertedWith("WrongDepositAmount");
    });
    it("Should revert if user deposits more then maxDeposit amount", async function () {
      await addPackage();
      await tokens[0]
        .connect(bob)
        .approve(rewardPackages.address, ethers.utils.parseEther("2000"));
      expect(
        rewardPackages
          .connect(bob)
          .depositTokens(tokens[0].address, ethers.utils.parseEther("2000"))
      ).to.be.revertedWith("WrongDepositAmount");
    });
    it("Should revert if user deposits to non-existing package", async function () {
      await addPackage();
      expect(
        rewardPackages
          .connect(bob)
          .depositTokens(tokens[1].address, ethers.utils.parseEther("100"))
      ).to.be.revertedWith("NoSuchPackage");
    });
    it("Should revert if user tries to withdraw before lock time", async function () {
      await addPackage();
      await addUserDeposits();

      expect(
        rewardPackages.connect(bob).withdrawTokens(tokens[0].address)
      ).to.be.revertedWith("WithdrawLocked");
    });
  });
  describe("Features", function () {
    it("Should allow to disable package if admin", async function () {
      await addPackage();
      expect(await rewardPackages.disablePackage(tokens[0].address)).to.be.ok;
    });
    it("Should allow to get info about users deposit", async function () {
      await addPackage();
      await addUserDeposits();

      expect(await rewardPackages.getUserInfo(bob.address, tokens[0].address))
        .to.be.ok;
    });
    it("Should allow to deposit to package", async function () {
      await addPackage();
      await tokens[0]
        .connect(bob)
        .approve(rewardPackages.address, ethers.utils.parseEther("500"));
      expect(
        await rewardPackages
          .connect(bob)
          .depositTokens(tokens[0].address, ethers.utils.parseEther("500"))
      ).to.be.ok;
    });
    describe("Rewards calculation", function () {
      it("Secondly rewards should be calculated correctly", async function () {
        await addPackage();
        await addUserDeposits();

        await time.increase(1100);

        expect(
          await rewardPackages.connect(bob).withdrawTokens(tokens[0].address)
        ).to.be.ok;

        let bobBalanceAfter = await tokens[0].balanceOf(bob.address);

        expect(bobBalanceAfter).to.be.greaterThanOrEqual(
          ethers.utils.parseEther("500").div(10_000).mul(1100)
        );
      });
      it("Hourly rewards should be calculated correctly", async function () {
        await addPackage(
          undefined,
          undefined,
          undefined,
          DepositRates.HOURLY,
          10000 // 0.01% yield
        );

        await addUserDeposits();

        await time.increase(3600 * 2 + 5); // forward 2 hours + 5 seconds offset

        expect(
          await rewardPackages.connect(bob).withdrawTokens(tokens[0].address)
        ).to.be.ok;

        let bobBalanceAfter = await tokens[0].balanceOf(bob.address);

        expect(bobBalanceAfter).to.be.greaterThanOrEqual(
          ethers.utils.parseEther("50").div(10_000).mul(2) // 2 hours = 2 rounds
        );
      });
      it("Daily rewards should be calculated correctly", async function () {
        await addPackage(
          undefined,
          undefined,
          undefined,
          DepositRates.DAILY,
          100000 // 0.1% yield
        );

        await addUserDeposits();

        await time.increase(3600 * 24 * 3 + 5); // forward 3 days + 5 seconds offset

        expect(
          await rewardPackages.connect(bob).withdrawTokens(tokens[0].address)
        ).to.be.ok;

        let bobBalanceAfter = await tokens[0].balanceOf(bob.address);

        expect(bobBalanceAfter).to.be.greaterThanOrEqual(
          ethers.utils.parseEther("50").div(10_000).mul(3) // 3 days = 3 rounds
        );
      });
    });
  });

  // utilty functions
  async function addPackage(
    name = "token0",
    token = tokens[0].address,
    lockTime = 1000,
    depositRate = DepositRates.SECONDLY,
    apy = 100,
    min = ethers.utils.parseEther("10"),
    max = ethers.utils.parseEther("1000")
  ) {
    lockTime = await getTimestampIn(lockTime);
    let _package = getPackage(name, lockTime, depositRate, apy, min, max);
    await rewardPackages.createPackage(token, _package);
  }

  async function addUserDeposits() {
    await tokens[0]
      .connect(bob)
      .approve(rewardPackages.address, ethers.utils.parseEther("50"));
    await rewardPackages
      .connect(bob)
      .depositTokens(tokens[0].address, ethers.utils.parseEther("50"));
    await tokens[0]
      .connect(alice)
      .approve(rewardPackages.address, ethers.utils.parseEther("500"));
    await rewardPackages
      .connect(alice)
      .depositTokens(tokens[0].address, ethers.utils.parseEther("500"));
  }
});
