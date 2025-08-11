import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import z from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'url';
import { CreateMessageResultSchema } from '@modelcontextprotocol/sdk/types.js';
const server = new McpServer({
    name: 'test',
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
        prompts: {}
    }
});
server.resource("users", "users://all", //URI type arguement
{
    description: "Get all users data from the database",
    title: "Users",
    mimeType: "application/json",
}, async (uri) => {
    const users = (await import(pathToFileURL(path.resolve("user.json")).href, {
        with: { type: "json" },
    }).then((m) => m.default));
    return {
        contents: [
            { uri: uri.href,
                text: JSON.stringify(users),
                mimeType: "application/json",
            },
        ],
    };
});
server.resource("user-details", new ResourceTemplate("users://{userId}/profile", { list: undefined }), {
    description: "Get all user detail from the database",
    title: "User detail",
    mimeType: "application/json",
}, async (uri, { userId }) => {
    const users = (await import(pathToFileURL(path.resolve("user.json")).href, {
        with: { type: "json" },
    }).then((m) => m.default));
    const user = users.find(u => u.id === parseInt(userId));
    if (user === null) {
        return {
            contents: [
                { uri: uri.href,
                    text: JSON.stringify({ error: "Not user found" }),
                    mimeType: "application/json",
                },
            ],
        };
    }
    return {
        contents: [
            { uri: uri.href,
                text: JSON.stringify(user),
                mimeType: "application/json",
            },
        ],
    };
});
server.tool("create-user", "Create a new user in database", {
    name: z.string(),
    email: z.string(),
    address: z.string(),
    phone: z.string()
}, {
    title: "Create User",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
}, async (params) => {
    try {
        const id = await createUser(params);
        return {
            content: [
                { type: 'text', text: `Saved User successful with id - ${id}` }
            ]
        };
    }
    catch (error) {
        return {
            content: [
                { type: 'text', text: "Failed to save users" }
            ]
        };
    }
});
server.prompt("generate-fake-user", "Generate a fake uesr based on a given name", {
    name: z.string(),
}, ({ name }) => {
    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Generate a fake user with name ${name}.The user should have a realistic email,address and phone number.`
                }
            }
        ]
    };
});
//sampling
server.tool("create-random-user", "Create a random user with fake data", {
    title: "Create Random User",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
}, async (params) => {
    try {
        const res = await server.server.request({
            method: "sampling/createMessage",
            params: {
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: "Generate fake user data.the user should have a realistic name, email , address and phone number.Return this data as a JSON object with no other text or formatter so it can be used with JSON.parse."
                        }
                    }
                ],
                maxTokens: 1024,
            }
        }, CreateMessageResultSchema);
        if (res.content.type !== 'text') {
            return {
                content: [{ type: "text", text: `Failed to get user data in text` }]
            };
        }
        try {
            const fakeUser = JSON.parse(res.content.text.trim()
                .replace(/^```json/, "")
                .replace(/```$/, ""));
            const id = await createUser(fakeUser);
            return {
                content: [{ type: "text", text: `User ${id} created successful` }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to generate user data` }]
            };
        }
    }
    catch (error) {
        return {
            content: [
                { type: 'text', text: "Failed to save random user" }
            ]
        };
    }
});
async function createUser(user) {
    const users = await import(pathToFileURL(path.resolve('user.json')).href, { with: { type: "json" } }).then(m => m.default);
    const id = users.length + 1;
    users.push({ id, ...user });
    await fs.writeFile(path.resolve('user.json'), JSON.stringify(users, null, 2));
    return id;
}
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main();
