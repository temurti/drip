const { web3tx, toWad, wad4human } = require("@decentral.ee/web3-helpers");
// const web3 = require("web3");

const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");

const TradeableFlow = artifacts.require("TradeableFlow");

const traveler = require("ganache-time-traveler");
const TEST_TRAVEL_TIME = 3600 * 2; // 1 hours


describe("TradeableFlow", function () {

    let accounts;

    before(async function () {
        accounts = await web3.eth.getAccounts();
    });
    
    const errorHandler = (err) => {
        if (err) throw err;
    };

    const names = ["Admin", "Alice", "Bob", "Carol", "Dan", "Emma", "Frank"];
    // accounts = accounts.slice(0, names.length);

    let sf;
    let dai;
    let daix;
    let app;
    const u = {}; // object with all users
    const aliases = {};

    before(async function () {
        //process.env.RESET_SUPERFLUID_FRAMEWORK = 1;
        await deployFramework(errorHandler, {
            web3,
            from: accounts[0],
        });
    });

    beforeEach(async function () {
        await deployTestToken(errorHandler, [":", "fDAI"], {
            web3,
            from: accounts[0],
        });
        await deploySuperToken(errorHandler, [":", "fDAI"], {
            web3,
            from: accounts[0],
        });

        sf = new SuperfluidSDK.Framework({
            web3,
            version: "test",
            tokens: ["fDAI"],
        });
        await sf.initialize();
        daix = sf.tokens.fDAIx;
        dai = await sf.contracts.TestToken.at(await sf.tokens.fDAI.address);

        for (var i = 0; i < names.length; i++) {
            u[names[i].toLowerCase()] = sf.user({
                address: accounts[i],
                token: daix.address,
            });
            u[names[i].toLowerCase()].alias = names[i];
            aliases[u[names[i].toLowerCase()].address] = names[i];
        }
        for (const [, user] of Object.entries(u)) {
            if (user.alias === "App") return;
            await web3tx(dai.mint, `${user.alias} mints many dai`)(
                user.address,
                toWad(100000000),
                {
                    from: user.address,
                }
            );
            await web3tx(dai.approve, `${user.alias} approves daix`)(
                daix.address,
                toWad(100000000),
                {
                    from: user.address,
                }
            );
        }
        //u.zero = { address: ZERO_ADDRESS, alias: "0x0" };
        console.log("Admin:", u.admin.address);
        console.log("Host:", sf.host.address);
        console.log(sf.agreements.cfa.address);
        console.log(daix.address);
        app = await TradeableFlow.new(
            u.admin.address,
            "TradeableFlow",
            "TF",
            sf.host.address,
            sf.agreements.cfa.address,
            daix.address
        );

        u.app = sf.user({ address: app.address, token: daix.address });
        u.app.alias = "App";
        await checkBalance(u.app);
    });

    async function checkBalance(user) {
        console.log("Balance of ", user.alias);
        console.log("DAIx: ", (await daix.balanceOf(user.address)).toString());
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
        console.log("Contract Owner: ", aliases[owner], " = ", owner);
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
            aliases[receiver]
        );
        return true;
    }
    describe("sending flows", async function () {

        it("Case #3 - Alice subscribe through Bobs referral code and Bob transfers his TCF to Emma", async () => {
            const { alice, bob, emma } = u;
            await upgrade([alice]);
            await checkBalances([alice, bob, emma, u.admin]);
            await daix.transfer(app.address, toWad(0.4000), {from: u.alice.address});
            const appInitialBalance = await daix.balanceOf(app.address);
            const aliceInitialBalance = await daix.balanceOf(u.alice.address);
            const bobInitialBalance = await daix.balanceOf(u.bob.address);
            const emmaInitialBalance = await daix.balanceOf(u.emma.address);
            const adminInitialBalance = await daix.balanceOf(u.admin.address);

            console.log("appInitialBalance" , appInitialBalance.toString());
            console.log("aliceInitialBalance" , aliceInitialBalance.toString());
            console.log("bobInitialBalance" , bobInitialBalance.toString());
            console.log("emmaInitialBalance" , emmaInitialBalance.toString());
            console.log("adminInitialBalance" , adminInitialBalance.toString());

            await appStatus();
            await logUsers();
            await app.makeAffiliateLink(u.bob.address, "1", toWad(0.00004000));
            await app.registerReferral(u.alice.address, 1);
            await app.registerReferral(u.carol.address, 1);
            await alice.flow({ flowRate: toWad(0.00004000), recipient: u.app });
            console.log("go forward in time");
            await traveler.advanceTimeAndBlock(TEST_TRAVEL_TIME);
            await appStatus();
            await logUsers();

            const appInnerBalance = await daix.balanceOf(u.app.address);
            const aliceInnerBalance = await daix.balanceOf(u.alice.address);
            const bobInnerBalance = await daix.balanceOf(u.bob.address);
            const emmaInnerBalance = await daix.balanceOf(u.emma.address);
            const adminInnerBalance = await daix.balanceOf(u.admin.address);

            console.log("appInnerBalance" , appInnerBalance.toString());
            console.log("aliceInnerBalance" , aliceInnerBalance.toString());
            console.log("bobInnerBalance" , bobInnerBalance.toString());
            console.log("emmaInnerBalance" , emmaInnerBalance.toString());
            console.log("adminInnerBalance" , adminInnerBalance.toString());

            // Transfer the TradeableCashflow token
            await app.approve(u.emma.address, 1, {from: u.bob.address});
            await app.transferFrom(u.bob.address, u.emma.address, 1, {from: u.bob.address});

            console.log("go forward in time");
            await traveler.advanceTimeAndBlock(TEST_TRAVEL_TIME);
            await appStatus();
            await logUsers();
            const appFinalBalance = await daix.balanceOf(app.address);
            const aliceFinalBalance = await daix.balanceOf(u.alice.address);
            const bobFinalBalance = await daix.balanceOf(u.bob.address);
            const emmaFinalBalance = await daix.balanceOf(u.emma.address);
            const adminFinalBalance = await daix.balanceOf(u.admin.address);

            console.log("appFinalBalance" , appFinalBalance.toString());
            console.log("aliceFinalBalance" , aliceFinalBalance.toString());
            console.log("bobFinalBalance" , bobFinalBalance.toString());
            console.log("emmaFinalBalance" , emmaFinalBalance.toString());
            console.log("adminFinalBalance" , adminFinalBalance.toString());

            assert.equal(
                (await u.app.details()).cfa.netFlow,
                "0",
                "App flowRate not 0"
            );

            assert.equal(
                bobFinalBalance.toString().substring(0,6),
                ((aliceInitialBalance - aliceInnerBalance) * 0.2).toString().substring(0,6),
                "bob balances aren't correct"
            );

            assert.equal(
                emmaFinalBalance.toString().substring(0,6),
                ((aliceInnerBalance - aliceFinalBalance) * 0.2).toString().substring(0,6),
                "emma balances aren't correct"
            );


            assert.equal(
                adminFinalBalance.toString().substring(0,6),
                ((aliceInitialBalance - aliceFinalBalance)).toString().substring(0,6),
                "admin balances aren't correct"
            );

        });
    });
});