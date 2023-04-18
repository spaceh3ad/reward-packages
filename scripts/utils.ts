import { BigNumber } from "ethers";
import { ethers } from "hardhat";

export enum DepositRates {
  SECONDLY,
  HOURLY,
  DAILY,
}

export type Package = {
  name: string;
  active: boolean;
  lockTime: number;
  rewardFrequency: DepositRates;
  rewardPercent: number;
  minDeposit: BigNumber;
  maxDeposit: BigNumber;
};

export function getPackage(
  name: string,
  lockTime: number,
  rate: DepositRates,
  rewardPercent: number,
  minDeposit: BigNumber,
  maxDeposit: BigNumber,
  active = true
): Package {
  return {
    name: name,
    active: active,
    lockTime: lockTime,
    rewardFrequency: rate,
    rewardPercent,
    minDeposit: minDeposit,
    maxDeposit: maxDeposit,
  };
}

export async function getTimestampIn(time = 1000) {
  const blockNumber = await ethers.provider.getBlockNumber();
  let { timestamp } = await ethers.provider.getBlock(blockNumber);
  return timestamp + time;
}
