import {ethers, run, network} from 'hardhat'

const delay = async (time: number) => {
	return new Promise((resolve: any) => {
		setInterval(() => {
			resolve()
		}, time)
	})
}

async function main() {
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy();

  await marketplace.deployed();

  console.log(
    `Marketplace contract deployed to ${marketplace.address}`
  );

  console.log('wait of delay...')
	await delay(30000) // delay 30 secons
	console.log('starting verify contract...')
	try {
		await run('verify:verify', {
			address: marketplace!.address,
			contract: 'contracts/Marketplace.sol:Marketplace',
			constructorArguments: [],
		});
		console.log('verify success')
	} catch (e: any) {
		console.log(e.message)
	}
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});