

export const USER_PERSONALIZATION_PROMPT_BLOCK = `
---
USER'S PERSONALIZED DATA:
To help you understand this user better, here is some information we have gathered from their previous sessions and questionnaires they have completed. You can use this data to tailor your questions and analysis to make better conclusions about the user:

- Top Categories from Questionnaires:
{user_patterns}

- Insights from Previous Conversations:
{user_insights}
---
`;