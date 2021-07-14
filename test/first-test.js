const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");
// const web3 = require("web3");

const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const TradeableFlow = artifacts.require("TradeableFlow");

const traveler = require("ganache-time-traveler");
const { assert } = require("hardhat");
const ONE_DAY = 3600 * 24;
const ONE_HOUR = 3600;
const ONE_MINUTE = 60;
const TO_GWEI = 10**18;


describe("TradeableFlow", function () {

    let accounts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
    });
    
    const errorHandler = (err) => {
        if (err) throw err;
    };

    const names = ["Admin", "Alice", "Bob", "Carol", "Dan", "Emma", "Frank"];

    let sf;
    let dai;
    let daix;
    let app;
    const user_directory = {}; // object with all users
    const alias_directory = {};

    before(async function () {
        //process.env.RESET_SUPERFLUID_FRAMEWORK = 1;
        // Deploy SuperFluid test framework
        await deployFramework(errorHandler, {
            web3,
            from: accounts[0],
        });
    });

    beforeEach(async function () {
        // Deploy fDAI ERC20 token
        await deployTestToken(errorHandler, [":", "fDAI"], {
            web3,
            from: accounts[0],
        });
        // Deploy fDAI SuperToken
        await deploySuperToken(errorHandler, [":", "fDAI"], {
            web3,
            from: accounts[0],
        });
        // Deploy and Initialize Superfluid JS SDK framework with fDAI token
        sf = new SuperfluidSDK.Framework({
            web3,
            version: "test",
            tokens: ["fDAI"],
        });
        await sf.initialize();
        // Get DAIx token instance from SDK
        daix = sf.tokens.fDAIx;
        // Get DAI token instance from 
        dai = await sf.contracts.TestToken.at(await sf.tokens.fDAI.address);
        // Constructing a user dictionary with the below mapping of aliases to Superfluid user objects
        // Constructing a alias diction with the mapping of addresses to aliases
        for (var i = 0; i < names.length; i++) {
            user_directory[names[i].toLowerCase()] = sf.user({
                address: accounts[i],
                token: daix.address,
            });
            user_directory[names[i].toLowerCase()].alias = names[i];
            alias_directory[user_directory[names[i].toLowerCase()].address] = names[i];
        }
        // Mint 100000000 DAI for each user (DAI isn't transfered to users, just minted)
        // Approving reception of DAIx for each user
        for (const [, user] of Object.entries(user_directory)) {
            if (user.alias === "App") return;
            await web3tx(dai.mint, `${user.alias} mints many DAI`)(
                user.address,
                toWad(100000000),
                {     
                    from: user.address,
                }
            );
            await web3tx(dai.approve, `${user.alias} approves DAIx`)(
                daix.address,
                toWad(100000000),
                {
                    from: user.address,
                }
            );
            checkDAIBalance(user)
        }
        //u.zero = { address: ZERO_ADDRESS, alias: "0x0" };
        console.log("Admin:", user_directory.admin.address);
        console.log("Host:", sf.host.address);
        console.log("CFA:", sf.agreements.cfa.address);
        console.log("DAIx",daix.address);
        // Deploy TradeableFlow contract
        app = await TradeableFlow.new(
            user_directory.admin.address,
            "TradeableFlow",
            "TF",
            sf.host.address,
            sf.agreements.cfa.address,
            daix.address
        );

        // Create Superfluid user for TradeableFlow contract
        user_directory.app = sf.user({ address: app.address, token: daix.address });
        user_directory.app.alias = "App";
        await checkBalance(user_directory.app);
    });

    async function checkBalance(user) {
        console.log("DAIx Balance of", user.alias, "is:", (await daix.balanceOf(user.address)).toString());
    }

    async function checkDAIBalance(user) {
        let bal = parseInt(await dai.balanceOf(user.address));
        console.log("DAI Balance of", user.alias, "is:", bal.toString());
        return bal;
    }
    
    async function checkDAIXBalance(user) {
        let bal = parseInt(await daix.balanceOf(user.address));
        console.log("DAIx Balance of", user.alias, "is:", bal.toString());
        return bal
    }

    async function checkBalances(accounts) {
        for (let i = 0; i < accounts.length; ++i) {
            await checkBalance(accounts[i]);
        }
    }

    async function upgrade(accounts) {
        for (let i = 0; i < accounts.length; ++i) {
            await web3tx(
                daix.upgrade,
                `${accounts[i].alias} upgrades many DAIx`
            )(toWad(100000000), { from: accounts[i].address });
            await checkBalance(accounts[i]);
        }
    }

    async function logUsers() {
        let string = "user\t\ttokens\t\tnetflow\n";
        let p = 0;
        for (const [, user] of Object.entries(u)) {
            if (await hasFlows(user)) {
                p++;
                string += `${user.alias}\t\t${wad4human(
                    await daix.balanceOf(user.address)
                )}\t\t${wad4human((await user.details()).cfa.netFlow)}
            `;
            }
        }
        if (p == 0) return console.warn("no users with flows");
        console.log("User logs:");
        console.log(string);
    }

    async function hasFlows(user) {
        const { inFlows, outFlows } = (await user.details()).cfa.flows;
        return inFlows.length + outFlows.length > 0;
    }

    async function appStatus() {
        const isApp = await sf.host.isApp(u.app.address);
        const isJailed = await sf.host.isAppJailed(app.address);
        !isApp && console.error("App is not an App");
        isJailed && console.error("app is Jailed");
        await checkBalance(u.app);
        await checkOwner();
    }
    async function checkOwner() {
        const owner = await app.getOwner();
        console.log("Contract Owner: ", alias_directory[owner], " = ", owner);
        return owner.toString();
    }

    async function transferNFT(to) {
        const receiver = to.address || to;
        const owner = await checkOwner();
        console.log("got owner from checkOwner(): ", owner);
        console.log("receiver: ", receiver);
        if (receiver === owner) {
            console.log("user === owner");
            return false;
        }
        await app.transferFrom(owner, receiver, 1, { from: owner });
        console.log(
            "token transferred, new owner: ",
            receiver,
            " = ",
            alias_directory[receiver]
        );
        return true;
    }
    describe("sending flows", async function () {

        it("Alice starts a flow for 10 minutes, Bob receives right amount", async () => {
            console.log("Case 1: Alice starts a flow for 10 minutes, Bob receives right amount")
            const { alice , bob } = user_directory;
            const rate = 0.001

            // Upgrade all of Alice's DAI
            await upgrade([alice]);
            let initialAliceBal = await checkDAIXBalance(alice);

            // Get Bob's initial DAIx balance (it's zero)
            let initialBobBal = await checkDAIXBalance(bob);

            // START flow from Alice to Bob at 0.001 DAI/second
            await alice.flow({flowRate: toWad(rate) , recipient: bob});

            // Advance one minute
            console.log("Go forward 1 minute in time");
            await traveler.advanceTimeAndBlock(ONE_MINUTE);

            // STOP flow from Alice to Bob
            await alice.flow({flowRate: "0" , recipient: bob});

            // ASSERT: Bob's balance is increased by rate*time
            let currentBobBal = await checkDAIXBalance(bob);
            assert.equal(currentBobBal-initialBobBal,rate*(ONE_MINUTE+1)*TO_GWEI,"Bob's balance differs from expected");

            // ASSERT: Alice's balance is decreased by rate*time
            let currentAliceBal = await checkDAIXBalance(alice);
            assert.equal(initialAliceBal-currentAliceBal,rate*(ONE_MINUTE+1)*TO_GWEI,"Alice's balance differs from expected");

            // ASSERT: Alice's stream has ended
            assert.equal(
                (await alice.details()).cfa.getNetFlow,
                0,
                "Alice's stream hasn't ended!"
            )

            

        });
    });
});