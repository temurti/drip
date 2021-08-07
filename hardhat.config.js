require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require('hardhat-contract-sizer');

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000
      }
    }
  },
  mocha: {
    timeout: 500000
  },
  networks: {
    // polygon: {
    //   url: "https://polygon-mainnet.infura.io/v3/" + process.env.INFURA_KEY,
    //   // url: "https://empty-rough-forest.matic.quiknode.pro/accde69e45a6f86670db4c9269b90ac5d70bcaf7/",
    //   accounts: [process.env.PRIVATE_KEY],
    //   gas: 2000000,
    //   gasPrice: 10000000000
    // },
    // rinkeby: {
    //   url: "https://rinkeby.infura.io/v3/" + process.env.INFURA_KEY,
    //   accounts: [process.env.PRIVATE_KEY],
    // },
    // hardhat: {
    //     forking: {
    //       url: "https://empty-rough-forest.matic.quiknode.pro/accde69e45a6f86670db4c9269b90ac5d70bcaf7/",
    //       accounts: ["ef8207b0d045d067ff1e8db5d30a4b70de7e5b1f755bbbffd216b9d975e1fc8c", process.env.PRIVATE_KEY_ALICE, process.env.PRIVATE_KEY_BOB],
    //     }
    // }
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  }
};

