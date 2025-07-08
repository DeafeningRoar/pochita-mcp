import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import axios from 'axios';
import { z } from "zod";
import * as cheerio from "cheerio";

const skillSchema = z.object({
	className: z.string().describe("The class name that has the skill"),
	skillName: z.string().describe("The name of the skill"),
	language: z.enum(['en', 'sp']).describe("The language of the skill description")
});

const setupTools = (server: McpServer) => {
	server.registerTool(
		"fetch-skill-description",
		{
			title: 'Fetch Lost Ark Skill Description',
			description: 'Fetch the description of a Lost Ark skill of a given class',
			inputSchema: skillSchema.shape,
		},
		async ({ className, skillName, language }) => {
			const { data } = await axios.get(`https://lostarkcodex.com/query.php?a=skills&l=us`);

			const skill = data.aaData.find((skill: any) => {
				const skillName = cheerio.load(skill[2]).text();
				const characterClass = skill[4];

				return skillName.toLowerCase() === skillName.toLowerCase() && characterClass.toLowerCase() === className.toLowerCase();
			});
		
			if (!skill) {
				return {
					content: [{ type: "text", text: `Skill ${skillName} not found` }]
				};
			}

			let [id, _, name] = skill;

			name = cheerio.load(name).text();

			const { data: skillDetails } = await axios.get(`https://lostarkcodex.com/tip.php?id=skill--${id}&enchant=0&l=${language}&nf=on`);
			
			const $ = cheerio.load(skillDetails);
			const details = $.text();

			return {
				content: [{ type: "text", text: details }]
			};
		}
	)
};

export default setupTools;
