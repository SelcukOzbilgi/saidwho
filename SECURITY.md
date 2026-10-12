# Security

## Reporting a problem

Please don't open a public issue for security problems. Open this project's [Security tab](https://github.com/SelcukOzbilgi/saidwho/security) on GitHub and click **Report a vulnerability**. Only I can see what you send, and I'll reply as soon as I can.

## How API keys are handled

- Secret keys stay on the server. Visitors never see them, and they're never published in this project's code.
- If the AI or search service returns an error, any key in it is removed before the error is shown or saved.
- The AI models will never see a key. Keys are added to requests by code, and nothing a model writes will ever be run as code.
- When you bring your own keys, they go to this app's server with your request and are used for that one run only. They're never stored, written to logs, or swapped for anyone else's key, and a run on your keys never falls back to mine.
- The free trial runs on my keys only when I switch it on, and stops for the day once a set budget is spent. Each visitor can also start only a few trial runs a day, and a set number of runs an hour on any keys. When the site saves runs, the budget and these counts are kept in its database, so every server shares them, and if the database can't be reached no trial run starts. Otherwise each server counts in its own memory, and the counts start over when it restarts.
- To count a visitor's runs, the site keeps a hash of their IP address made with a secret key, never the address itself. Once the hour or day it counts has been over for an hour, the hash is deleted as later runs are counted, a batch at a time, so on a quiet day it can stay a while longer.
- The site sends browser security headers (including a Content Security Policy), so the page only loads data from this site. Links to sources open the source's own page. Calls to Nebius and Tavily happen on the server.
- Commits are checked for leaked secrets on my machine before they're saved, and again on GitHub for every pull request and every change to the main branch.
