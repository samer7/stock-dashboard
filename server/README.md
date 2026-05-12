# Stock Dashboard API

Minimal Express backend that proxies Finnhub stock quotes for the frontend. Hides the API key from the browser and caches responses to stay under rate limits.

## What it does

- One endpoint: `GET /api/quote/:ticker` (e.g. `/api/quote/AAPL`)
- Calls Finnhub, returns reshaped JSON
- Caches each ticker for 60 seconds in memory
- Health check at `GET /health`

---

## Local setup

### 1. Install Node

If you don't have it: download the LTS version from [nodejs.org](https://nodejs.org). Verify in a terminal:

```
node --version
```

You want v18 or higher. v20+ recommended.

### 2. Get a Finnhub API key

Sign up at [finnhub.io](https://finnhub.io). Free tier gives ~60 requests/minute. Copy your key from the dashboard.

### 3. Install dependencies

In the `/server` folder:

```
npm install
```

This reads `package.json` and downloads `express`, `cors`, and `dotenv` into a `node_modules` folder (which is gitignored — never commit it).

### 4. Create your `.env` file

Copy the example file:

```
cp .env.example .env
```

Open `.env` in your editor and replace `your_finnhub_key_here` with your real key. The `.env` file is gitignored — verify with `git status` that it doesn't appear before committing anything.

### 5. Run the server

```
npm start
```

You should see:

```
Server running on port 3000
Try: curl http://localhost:3000/api/quote/AAPL
```

### 6. Test it

In a new terminal (leave the server running in the first one):

```
curl http://localhost:3000/api/quote/AAPL
```

You should get back something like:

```json
{
  "ticker": "AAPL",
  "price": 213.49,
  "change": 2.14,
  "changePct": 1.01,
  "high": 215.20,
  "low": 211.80,
  "open": 212.10,
  "prevClose": 211.35,
  "timestamp": 1746998400
}
```

If you call it again within 60 seconds, the response will include `"cached": true`. That's the cache working.

To stop the server: `Ctrl+C` in the terminal where it's running.

---

## Deploying to Render

### 1. Push to GitHub

Make sure the `/server` folder is committed to your `stock-dashboard` repo. Verify `.env` is **not** in the commit (`git status` should not list it).

### 2. Create a Render account

Sign up at [render.com](https://render.com). Free tier works.

### 3. Create a new Web Service

- Click "New +" → "Web Service"
- Connect your GitHub account and select the `stock-dashboard` repo
- Configure:
  - **Name**: `stock-dashboard-api` (or whatever you want — this becomes part of your URL)
  - **Root Directory**: `server`
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
  - **Plan**: Free

### 4. Add the environment variable

Scroll down to "Environment Variables" and add:

- **Key**: `FINNHUB_API_KEY`
- **Value**: your real Finnhub key

This is the production equivalent of your local `.env` file. Render injects it into the running app.

### 5. Deploy

Click "Create Web Service." Render will install dependencies, start the server, and give you a URL like `https://stock-dashboard-api.onrender.com`.

### 6. Test the deployed version

```
curl https://your-app-name.onrender.com/api/quote/AAPL
```

Same response as local. You're done.

---

## Notes

- **Free tier cold starts**: Render's free tier spins down the server after 15 minutes of inactivity. The next request takes ~30 seconds to wake it up. For a personal tool this is fine. The frontend should show a loading state.
- **Rate limit**: Finnhub free tier is ~60 calls/minute. With the 60-second cache, you can have a watchlist of any size and stay well under the limit as long as users aren't refreshing constantly.
- **If you ever leak the key**: regenerate it immediately at finnhub.io, then update both your local `.env` and the Render environment variable. The old key becomes worthless within seconds.

---

## Next steps (after this is working)

- Add a `/api/candle/:ticker` endpoint that returns historical prices (needed for real sparklines and MA computation)
- Compute MA20/50/200 server-side from candle data
- Wire the frontend to call this backend instead of using hardcoded data
