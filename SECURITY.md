# Security

## Reporting a problem

Please don't open a public issue for security problems. Open this project's [Security tab](https://github.com/SelcukOzbilgi/saidwho/security) on GitHub and click **Report a vulnerability**. Only I can see what you send, and I'll reply as soon as I can.

## How API keys are handled

- Secret keys stay on the server. Visitors never see them, and they're never published in this project's code.
- If the AI or search service returns an error, any key in it is removed before the error is shown or saved.
- The AI models will never see a key. Keys are added to requests by code, and nothing a model writes will ever be run as code.
- When you bring your own keys (this arrives with the public demo), they'll be used for your run only. They won't be stored, written to logs, or swapped for anyone else's key.
- Commits are checked for leaked secrets on my machine before they're saved, and again on GitHub for every pull request and every change to the main branch.
