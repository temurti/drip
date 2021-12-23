async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
  
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const TradeableFlow = await ethers.getContractFactory("TradeableFlow");

    const token = await TradeableFlow.deploy(            
        "0xc41876DAB61De145093b6aA87417326B24Ae4ECD",      // program owner address (get's the revenue cash flow)
        "0xc41876DAB61De145093b6aA87417326B24Ae4ECD",      // Drip owner address (Drip admin, can lock program if not being paid)
        "Uniwhales Drip Cashflow NFT",                        
        "DRIP-UWL",
        "base-link",                                       // base URI
        "0xeD5B5b32110c3Ded02a07c8b8e97513FAfb883B6",      // host
        "0xF4C5310E51F6079F601a5fb7120bC72a70b96e2A",      // cfa
        200000000000,                                      // Affiliate Portion (20%)
        ""                                                 // Registration key (will not be blank for mainnet deployment)
    );

    console.log("Contract address:", token.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
});

// npx hardhat run scripts/deploy.js --network rinkeby
// fake UWL: 0xbDfb61f061250a1f6A9e184B7B0EE8d7d4f83cfC
// second latest DEPLOYED_CONTRACT_ADDRESS: 0x25e69bf13d58b2e166Da273Bba1af03a99F98707
// latest: 0xBcAfDcFFA41B511521aa3Ba597fc427bDd7Ba52C
// npx hardhat verify --network rinkeby --constructor-args arguments.js 0xBcAfDcFFA41B511521aa3Ba597fc427bDd7Ba52C