"use strict";

const dynamoUserLib = require('dynamodb/dynamo-entities/user/index');

exports.lambdaHandler = async (event, context, callback) => {

    // Extract data
    const cognitoId = event.request.userAttributes.sub;
    const userEmail = event.request.userAttributes.email;

    // Extract name data
    let firstName = "";
    let lastName = "";
    const userName = event.request.userAttributes['custom:userName'];
    if (userName) {
        const userNameSplit = userName.split(" ");
        if (userNameSplit.length > 0) {
            firstName = userNameSplit[0];
        }
        if (userNameSplit.length > 1) {
            lastName = userNameSplit[1];
        }
    }
    let userIdentities = event.request.userAttributes.identities;
    let userSocialProviderName = "";
    let userSocialProviderType = "";
    let userSocialProviderUserId = "";

    if (userIdentities) {
        userIdentities = JSON.parse(userIdentities);
        userSocialProviderName = userIdentities[0]["providerName"];
        userSocialProviderType = userIdentities[0]["providerType"];
        userSocialProviderUserId = userIdentities[0]["userId"];
    }

    // Register user
    try {
        // Register user
        await dynamoUserLib.registerUser(firstName, lastName, userEmail.trim().toLowerCase(), cognitoId, userSocialProviderName, userSocialProviderType, userSocialProviderUserId);
    }
    catch (e) {
        console.error("User may already be registered", e);
    }

    callback(null, event);
};