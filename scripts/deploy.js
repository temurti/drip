async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
  
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const TradeableFlow = await ethers.getContractFactory("TradeableFlow");

    const token = await TradeableFlow.deploy(            
        deployer.address,
        "TradeableFlow v3",
        "TF",
        "0xeD5B5b32110c3Ded02a07c8b8e97513FAfb883B6",      // host
        "0xF4C5310E51F6079F601a5fb7120bC72a70b96e2A",      // cfa
        // "0x745861AeD1EEe363b4AaA5F1994Be40b1e05Ff90",   // SuperToken accepted by app (starting off with fDAIx)
        "0xbDfb61f061250a1f6A9e184B7B0EE8d7d4f83cfC",      // ERC20Restrict token
        200000000000                                       // Affiliate Portion (20%));
    );

    console.log("Contract address:", token.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
});