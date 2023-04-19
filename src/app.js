const { buildResponse } = require("/opt/nodejs/helper.js");
const {
	getAllUsers,
	getUserDetailsById,
	checkTeamById,
	checkUserExists,
	addUser,
	checkUserAssociation,
	deleteUserById
} = require("./userMaintenance.service");
const {
	teamKeywordSchema,
	userIdSchema,
	addUserSchema,
	updateUserSchema
} = require("./userMaintenance.validation");
/**
 * lambda handler for user maintenance
 * @param {object} event
 * @param {*} context
 * @returns
 */

const lambdaHandler = async (event, context) => {
	let response; // response variable returned by lambda

	try {
		/**
		 * Logging event object received by lambda
		 */
		console.info("User Maintenance lambda invoked, event atached below");
		console.log(JSON.stringify(event));

		/**
		 * variables used in switch statements
		 */
		let eventMethod = event.httpMethod;
		// Just Test
		let eventPath = event.resource;
		switch (eventPath) {
			case "/user":
				if (eventMethod === "GET") {
					response = await handleGetAllUsers(event);
				} else {
					response = buildResponse(404, {
						message: "No Such Method"
					});
				}
				break;
			case "/user/create":
				if (eventMethod === "POST") {
					response = await handleCreateUser(event);
				} else {
					response = buildResponse(404, {
						message: "No Such Method"
					});
				}
				break;
			case "/user/{userId}":
				if (eventMethod === "GET") {
					response = await handleGetUserDetails(event);
				} else if (eventMethod === "PUT") {
					response = await handleUpdateUser(event);
				} else if (eventMethod === "DELETE") {
					response = await handleDeleteUser(event);
				} else {
					response = buildResponse(404, {
						message: "No Such Method"
					});
				}
				break;
			default:
				console.info("Error Occured");
				response = buildResponse(404, {
					message: "No Such Method"
				});
				break;
		}
		// Returning response
		return response;
	} catch (error) {
		console.log("Error Occured");
		console.log(error);
		response = buildResponse(500, {
			message: "Internal Error Occured"
		});
	}
	return response;
};

/**
 * gives list of users on the system
 * @param {object} event
 * @returns response array of object containing
 */
const handleGetAllUsers = async (event) => {
	let validTeamName;
	if (event.queryStringParameters) {
		try {
			validTeamName = await teamKeywordSchema.validateAsync(
				event.queryStringParameters
			);
		} catch (error) {
			return buildResponse(400, {
				message: error.message
			});
		}
	}

	const formattedData = await getAllUsers(process.env, validTeamName?.team);
	const users = formattedData.map((user) => ({
		id: user?.id?.toString(),
		firstName: user?.first_name,
		lastName: user?.last_name,
		status: user?.status,
		team: {
			id: user?.team_id?.toString(),
			value: user?.team_name
		},
		initials: user?.initials,
		createdBy: {
			id: user?.creator_id,
			name: user?.created_by
		},
		addedDate: new Date(user.created_at).toISOString()
	}));

	return buildResponse(200, users);
};

/**
 * gives details of user by ID
 * @param {object} event
 * @returns response user details object
 */
const handleGetUserDetails = async (event) => {
	if (event.pathParameters) {
		let validUserId;
		try {
			let pathParams = event.pathParameters;
			validUserId = await userIdSchema.validateAsync(pathParams);
		} catch (error) {
			return buildResponse(400, {
				message: error.message
			});
		}

		let userDataResponse = await getUserDetailsById(
			process.env,
			validUserId.userId
		);
		if (!userDataResponse.success) {
			return buildResponse(404, { message: userDataResponse.message });
		}

		const userData = userDataResponse.data;
		const user = {
			id: userData?.id?.toString(),
			firstName: userData?.first_name,
			lastName: userData?.last_name,
			status: userData?.status,
			email: userData?.email,
			team: {
				id: userData?.team_id?.toString(),
				value: userData?.team_name
			},
			initials: userData?.initials,
			createdBy: {
				id: userData?.creator_id,
				name: userData?.created_by
			},
			addedDate: new Date(userData.created_at).toISOString()
		};

		return buildResponse(200, user);
	}
	return buildResponse(400, {
		message: "Missing userId Path Parameter"
	});
};

/**
 * gives list of users on the system
 * @param {object} event
 * @returns response array of object containing
 */
const handleUpdateUser = async (event) => {
	if (event.pathParameters !== null && event.body !== null) {
		// let validUserId;
		let validUserData;
		try {
			// let pathParams = event.pathParameters;
			let userData = JSON.parse(event.body);

			// let validUserId = await userIdSchema.validateAsync(pathParams);
			validUserData = await updateUserSchema.validateAsync(userData);
		} catch (error) {
			return buildResponse(400, {
				message: error.message
			});
		}

		// Validate Team ID
		let teamData = await checkTeamById(process.env, validUserData.teamId);

		if (!teamData.success) {
			return buildResponse(404, { message: teamData.message });
		}
		let updateData;

		if (!updateData.success) {
			return buildResponse(500, {
				message: updateData.message
			});
		}
		return buildResponse(200, { message: "User Updated Successfully" });
	}
	return buildResponse(400, {
		message: "Missing userId Path Parameters or User data"
	});
};

/**
 * validate user data sent with request body
 * check if associated teamId already present in db
 * if validation is successful, create user with given data
 * else send response with appropriate error message
 *
 * @param {object} event
 * @returns {object} response with id of the created user
 */
const handleCreateUser = async (event) => {
	if (event.body !== null) {
		let userData = JSON.parse(event.body);
		let validUserData;
		try {
			validUserData = await addUserSchema.validateAsync(userData);
		} catch (error) {
			return buildResponse(400, {
				message: error.message
			});
		}

		// Validate Team ID
		const teamData = await checkTeamById(process.env, validUserData.teamId);

		if (!teamData.success) {
			return buildResponse(404, { message: teamData.message });
		}

		// Validate if the user already exists
		const existingUser = await checkUserExists(process.env, validUserData);

		if (!existingUser.success) {
			return buildResponse(400, { message: existingUser.message });
		}

		// Add Created user id
		validUserData.createdByUserId = event.requestContext.authorizer.userId;

		// create user
		let userCreateResponse = await addUser(process.env, validUserData);

		return buildResponse(200, {
			id: userCreateResponse.id,
			message: "User created successfully"
		});
	}
	return buildResponse(400, {
		message: "Requires Uesr data"
	});
};

/**
 * delete user by ID
 * @param {object} event
 * @returns response array of object containing
 */
const handleDeleteUser = async (event) => {
	if (event.pathParameters) {
		let validUserId;
		try {
			let pathParams = event.pathParameters;
			validUserId = await userIdSchema.validateAsync(pathParams);
		} catch (error) {
			return buildResponse(400, {
				message: error.message
			});
		}

		// Check user exists
		let userDataResponse = await getUserDetailsById(
			process.env,
			validUserId.userId
		);
		if (!userDataResponse.success) {
			return buildResponse(404, { message: userDataResponse.message });
		}

		// Check if user is associated with any entity
		let userAssociated = await checkUserAssociation(
			process.env,
			validUserId.userId
		);
		if (!userAssociated.success) {
			return buildResponse(400, { message: userAssociated.message });
		}

		// TODO Delete from user_access table when authorization is introduced.

		// Delete the user
		const deleteAccountResponse = await deleteUserById(
			process.env,
			validUserId.userId
		);
		console.log("deleteAccountResponse", deleteAccountResponse);

		return buildResponse(200, { message: "User Deleted Successfully" });
	}
	return buildResponse(400, {
		message: "Missing userId Path Parameter"
	});
};

module.exports = {
	lambdaHandler,
	handleGetAllUsers,
	handleGetUserDetails,
	handleUpdateUser,
	handleDeleteUser,
	handleCreateUser
};
