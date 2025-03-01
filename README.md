# Animation Streaming Service

This project is a web service for streaming animations using Cloudflare Workers.

## Setup Instructions

### 1. Install the Required Tools

First, install Node.js and npm:
- Download from [nodejs.org](https://nodejs.org/)
- Or use a package manager for your system

Then install Wrangler (Cloudflare Workers CLI):
```
npm install -g wrangler
```

### 2. Create KV Namespaces

Run these commands to create the KV namespaces:
```
wrangler kv:namespace create "ANIMATION_LOGS"
wrangler kv:namespace create "ANIMATION_LOGS" --preview
wrangler kv:namespace create "ANIMATION_HISTORY"
wrangler kv:namespace create "ANIMATION_HISTORY" --preview
```

After creating them, copy the IDs and update your `wrangler.prod.toml` file.

### 3. Set Up Your Domain

1. Register your domain in Cloudflare
2. Get your Zone ID from the Cloudflare dashboard
3. Update the routes in `wrangler.prod.toml` with your domain and Zone ID

### 4. Update the JWT Secret

In `wrangler.prod.toml`, change the JWT_SECRET value to a strong secret key. By default `AUTH_ENABLE=false` to simplify testing. 

### 5. Set Up Configuration Files

This project uses two separate configuration files:

1. `wrangler.dev.toml` - That's my(Lopson's) personal config file, used for testing purpose
2. `wrangler.prod.toml` - For production deployment by reviewers

Make sure to update `wrangler.prod.toml` file with your specific:
- KV namespace IDs
- Zone IDs
- Domain names
- Secret keys

### 6. Deploy Your Project

- First, login to Cloudflare:
	```
	wrangler login
	```

- For production deployment (for reviewers):
	```
	npm run deploy-prod
	```

- Don't forget to enable your service on `Workers & Pages -> {YOUR_WORKER_NAME}`

### 7. Test Your Deployment

There is a special script - `./scripts/animation-test.mjs` that helps with testing(AI generated)

1) It can be run for environments – `prod | dev`
2) For local testing:
	- first start dev server
		```bash
		npm run dev
		```
	- run tests
		```bash
		npm run itest
		```
3) For prod testing:
   - first do the deployment
		```bash
		npm run deploy
		``` 
	- run tests
		```bash
		npm run itest:prod
		``` 	

## Environment Variables

- `ENVIRONMENT`: "development" or "production"
- `AUTH_ENABLED`: "true" or "false" to enable/disable authentication
- `API_KEY_HEADER`: The header name for API key authentication
- `JWT_SECRET`: Secret key for JWT token signing

## Important notes

1) By default `AUTH_ENABLED=false` in order to simplify testing
2) Using Hibernation Websockets, since it significantly decreases duration charge, and provides additional features that pair well with WebSocket applications
3) Used AI to help me, because it's my first time working with Cloudflare Serverless, KV, Durable Object, etc.
4) As for scaling, as far as I understand - Cloudflare helps here a lot with Workers ability  automatically scale onto thousands of Cloudflare global network
	- As for my side, I used Hibernation Websockets,which removes "dead" connections
	- I can remove broadcasting for unnecessary messages(eg Client connections). If I understand correctly - service suppose to work with some ML/LLM model under the hood and clients will only receive animations based on text message, but that's just my guess/
	- I can batch command messages by time ranges(say 500ms) and send the batch to client(s)
	- Change broadcasting, by implementing SET/MAP of target clients, for example based on characters. Here I need more product details
5) Monitoring – we have monitoring out-of-the-box in Cloudflare
6) 