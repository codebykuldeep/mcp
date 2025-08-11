import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { promise } from "zod/v4";
import env from "dotenv";
import { confirm, input, input, select } from "@inquirer/prompts";
import { Prompt, PromptMessage, Tool } from "@modelcontextprotocol/sdk/types.js";
env.config();
import { generateText } from 'ai'
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { JSONSchema } from "zod/v4/core";

const mcp = new Client(
  {
    name: "text-client-video",
    version: "1.0.0",
  },
  { capabilities: { sampling: {} } }
);
const gemini_api_key = process.env.GEMINI_API_KEY;
const google = createGoogleGenerativeAI({
    apiKey:process.env.GEMINI_API_KEY
})
const transport = new StdioClientTransport({
  command: "node",
  args: ["build/server.js"],
  stderr: "ignore",
});

async function main() {
  await mcp.connect(transport);
  const [{ tools }, { prompts }, { resources }, { resourceTemplates }] =
    await Promise.all([
      mcp.listTools(),
      mcp.listPrompts(),
      mcp.listResources(),
      mcp.listResourceTemplates(),
    ]);
  console.log("YOU ARE CONNECTED");
  while (true) {
    const option = await select({
      message: "What you like to do",
      choices: ["Query", "Tools", "Resources", "Prompts"],
    });

    switch (option) {
      case "Tools": {
        const toolname = await select({
          message: "Select a Tool",
          choices: tools.map((tool) => ({
            name: tool.annotations?.title || tool.name,
            value: tool.name,
            description: tool.description,
          })),
        });
        const tool = tools.find(t => t.name === toolname);
        if(tool === null){
            console.error('Tool not found');
        }
        else{
            await handleTool(tool as Tool);
        }
        break;
      }
      case "Resources": {
        const resourceURI = await select({
          message: "Select a Resource",
          choices: [
            ...resources.map((resource) => ({
            name: resource.name,
            value: resource.uri,
            description: resource.description,
          })),
          ...resourceTemplates.map((template) => ({
            name: template.name,
            value: template.uriTemplate,
            description: template.description,
          })),
          ],
        });
        console.log(resourceURI);
        console.log(resourceTemplates);
        
        const uri = resources.find(t => t.uri === resourceURI)?.uri ||  resourceTemplates.find(t => t.uriTemplate === resourceURI)?.uriTemplate ;
        console.log(uri);
        if(uri === null){
            console.error('Resource not found');
        }
        else{
            await handleResource(uri!);
        }
        break;
      }
      case "Prompts": {
        const promptName = await select({
          message: "Select a Prompt",
          choices: prompts.map((prompt) => ({
            name: prompt?.name,
            value: prompt.name,
            description: prompt.description,
          })),
        });
        const prompt = prompts.find(t => t.name === promptName);
        if(prompt === null){
            console.error('Prompt not found');
        }
        else{
            await handlePrompt(prompt as Prompt);
        }
        break;
      }
      case "Query":{
        await handleQuery(tools);
      }
    }
  }
}


async function handleTool(tool:Tool) {
    const args:Record<string,string> = {};
    for(const [key,value] of Object.entries(tool.inputSchema.properties ?? {})){
        args[key] = await input({
            message :`Enter value for ${key} ${(value as {type:string}).type} `
        })
    }

    const res = await mcp.callTool({
        name:tool.name,
        arguments:args
    })
    console.log(res)

}


async function handleResource(uri:string) {
    let finalUri = uri;
    const paramMatches = uri.match(/{([^]+)}/g)
    if(paramMatches != null){
        for(const paramMatch of paramMatches){
       const paramValue = await input({
            message :`Enter value for ${paramMatch} `
        })
        finalUri = finalUri.replace(paramMatch,paramValue)
    }
    }
    

    const res = await mcp.readResource({
        uri:finalUri
    })
    console.log(res)

}


async function handlePrompt(prompt:Prompt) {
    const args:Record<string,string> = {};
    for(const arg of prompt.arguments ?? []){
        args[arg.name] = await input({
            message :`Enter value for ${arg.name}`
        })
    }

    const res = await mcp.getPrompt({
        name:prompt.name,
        arguments:args
    })
    console.log(res)
    for(const message of res.messages){
        console.log(await handleServerMessagePrompt(message));
    }

}

async function handleServerMessagePrompt(message:PromptMessage){
    if(message.content.type !== 'text') return;

    console.log(message.content);
    const run = await confirm({
        message:'would you like to run above prompt',
        default:true
    })

    if(!run) return;
    const {text } = await generateText({
        model:google('gemini-2.0-flash'),
        prompt:message.content.text
    });
    return text;
}


async function handleQuery(tools: Tool[]) {
    const query = await input({ message: "Enter your query" });
    const { text, toolResults } = await generateText({
        model: google('gemini-2.0-flash'),
        prompt: query,
        tools: tools.reduce((obj, tool) => ({
            ...obj,
            [tool.name]: {
                description: tool.description,
                parameters: tool.inputSchema?.properties ?? {},
                execute: async (args: Record<string, any>) => {
                    return await mcp.callTool({
                        name: tool.name,
                        arguments: args
                    });
                }
            }
        }), {})
    });
    console.log(text);
    console.log(toolResults);
}
main();
