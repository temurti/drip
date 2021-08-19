"_createOutflow no aff":false,
"_createOutflow w/ aff, 2 subscribers":false,
"_updateOutflow no aff (increase)":false,
"_updateOutflow no aff (decrease)": false,
"_updateOutflow w/ aff (increase then decrease)": false,


if (switchBoard["_createOutflow no aff"]) {

    it("Testing _createOutflow no affiliation", async () => {
    // SET UP

        const { alice , bob, admin } = user_directory
        const userList = [alice , bob, admin]
        const rate = 0.0000001

        // Mint Bob 10000 $UWL and an affiliate NFT
        uwl.transfer(bob,10000, {from:alice})
        await checkTokenBalance(bob,uwl)
        await app.mint("BlueWhale", {from:bob})

        // Upgrade all of Alice and Bob's DAI
        await upgrade([alice,bob],token_directory["fDAI"]["supertoken"]);
        await upgrade([alice,bob],token_directory["fUSDC"]["supertoken"]);

    // PART 1: User with no affiliation opens stream to app but with erratic affiliate code

        // Create invalid affiliate code
        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string','PilotWhale');

        // Start flow from Alice to App at 0.001 DAI/second
        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData});

        await logUsers(userList)

    // PART 2: Check that app handles additional flow properly

        // Start flow from Alice to App at 0.001 DAI/second
        await sf.cfa.createFlow({
            superToken:   token_directory["fUSDC"]["supertoken"].address, 
            sender:       bob,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData});

        await logUsers(userList)

    });

}

if (switchBoard["_createOutflow w/ aff, 2 subscribers"]) {

    it("Testing _createOutflow with affiliation", async () => {
// SET UP

    const { alice , bob , carol , admin } = user_directory
    const userList = [ alice , bob , carol , admin ]
    const rate = 0.0000001

    // Mint Bob 10000 $UWL and an affiliate NFT
    await uwl.transfer(bob,10000, {from:alice})
    await checkTokenBalance(bob,uwl)
    await app.mint("BlueWhale", {from:bob})

    // Upgrade all of Alice, Carol, and Bob's DAI
    await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

    // Give App a little DAIx so it doesn't get mad over deposit allowance
    await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

// PART 1: Open stream from Alice with Bob's affiliate code "BlueWhale"
    console.log("=== PART 1: Open stream from Alice with Bob's affiliate code 'BlueWhale' ===")

    // Create valid affiliate code
    let aliceEncodedUserData = web3.eth.abi.encodeParameter('string','BlueWhale');

    // Start flow from Alice to App at 0.001 DAI/second
    await sf.cfa.createFlow({
        superToken:   token_directory["fDAI"]["supertoken"].address, 
        sender:       alice,
        receiver:     user_directory.app,
        flowRate:     "10000",
        userData:     aliceEncodedUserData});

    await logUsers(userList)

// PART 2: Open stream from Carol with Bob's affiliate code "BlueWhale"
    console.log("=== PART 2: Open stream from Carol with Bob's affiliate code 'BlueWhale' ===")

    // Create valid affiliate code
    let carolEncodedUserData = web3.eth.abi.encodeParameter('string','BlueWhale');

    // Start flow from Alice to App at 0.001 DAI/second
    await sf.cfa.createFlow({
        superToken:   token_directory["fDAI"]["supertoken"].address, 
        sender:       carol,
        receiver:     user_directory.app,
        flowRate:     "10000",
        userData:     carolEncodedUserData});

    await logUsers(userList)

    });

}

if (switchBoard["_updateOutflow no aff (increase)"]) {

    it("Testing _updateOutflow increase without affiliation", async () => {
    // SET UP
        const { alice , bob , carol , admin } = user_directory
        const userList = [alice , bob , carol , admin]

        // Upgrade all of Alice, Carol, and Bob's DAI
        await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

        // Give App a little DAIx so it doesn't get mad over deposit allowance
        await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"");

    // PART 1
        console.log("=== PART 1: Open stream from Alice to app ===")

        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData
        });

        var tempUser = sf.user({ address: user_directory.admin, token: token_directory["fDAI"]["supertoken"].address });
        console.log( "Netflow Owner" , (await tempUser.details()).cfa.netFlow )

        await logUsers(userList)
        
    // PART 2
        console.log("=== PART 2: Increase stream from Alice to app by 2x ===")

        await sf.cfa.updateFlow({
            superToken: token_directory["fDAI"]["supertoken"].address,
            sender: alice,
            receiver: user_directory.app,
            flowRate: "20000",
            aliceEncodedUserData
        });

        await logUsers(userList)

    });

}

if (switchBoard["_updateOutflow no aff (decrease)"]) {

    it("Testing _updateOutflow decrease without affiliation", async () => {
    // SET UP
        const { alice , bob , carol , admin } = user_directory
        const userList = [ alice , bob , carol , admin ]

        // Upgrade all of Alice, Carol, and Bob's DAI
        await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

        // Give App a little DAIx so it doesn't get mad over deposit allowance
        await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"");

    // PART 1: Open stream from Alice to app
        console.log("=== PART 1: Open stream from Alice to app ===")

        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "20000",
            userData:     aliceEncodedUserData
        });

        await logUsers(userList)

    // PART 2: cut stream in half
        console.log("=== PART 2: Decrease stream from Alice to app by 1/2 ===")

        await sf.cfa.updateFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address,
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData
        });

        await logUsers(userList)
    
    });
}

if (switchBoard["_updateOutflow w/ aff (increase then decrease)"]) {

    it("Testing _updateOutflow increase with affiliation", async () => {
    // SET UP
        const { alice , bob , carol , admin } = user_directory
        userList = [alice , bob , carol , admin]

        // Mint Bob 10000 $UWL and an affiliate NFT
        await uwl.transfer(bob,10000, {from:alice})
        await checkTokenBalance(bob,uwl)
        await app.mint("BlueWhale", {from:bob})

        // Upgrade all of Alice, Carol, and Bob's DAI
        await upgrade([alice,bob,carol],token_directory["fDAI"]["supertoken"]);

        // Give App a little DAIx so it doesn't get mad over deposit allowance
        await token_directory["fDAI"]["supertoken"].transfer(user_directory.app, 100000000000000, {from:alice});

        let aliceEncodedUserData = web3.eth.abi.encodeParameter('string',"BlueWhale");

    // PART 1
        console.log("=== PART 1: Open stream from Alice to app with affiliate code ===")

        await sf.cfa.createFlow({
            superToken:   token_directory["fDAI"]["supertoken"].address, 
            sender:       alice,
            receiver:     user_directory.app,
            flowRate:     "10000",
            userData:     aliceEncodedUserData
        });

        // Check flow results - did affiliate get share?
        await logUsers(userList)

    // PART 2
        console.log("=== PART 2: Increase stream from Alice to app by 2x ===")

        await sf.cfa.updateFlow({
            superToken: token_directory["fDAI"]["supertoken"].address,
            sender: alice,
            receiver: user_directory.app,
            flowRate: "20000"
        });

        // Check flow results - did affiliate share get increased?
        await logUsers(userList)

    // PART 3
        console.log("=== PART 3: End Alice's stream (update to zero) ===")

        await sf.cfa.deleteFlow({
            superToken: token_directory["fDAI"]["supertoken"].address,
            sender:     alice,
            receiver:   user_directory.app,
            by:         alice
        });

        // Check flow results - did affiliate share get increased?
        await logUsers(userList)
        
    });
}