 require('isomorphic-fetch')
const axios = require('axios')
const Koa = require('koa')
const Router = require("koa-router")
const  { default: shopifyAuth, verifyRequest} = require('@shopify/koa-shopify-auth')
const { default: Shopify, ApiVersion} = require('@shopify/shopify-api')
const session = require('koa-session')

// Loads the .env file into process.env. This is usually done using actual environment variables in production
const dotenv = require("dotenv")
dotenv.config();

const port = parseInt(process.env.PORT, 10) || 8081;
// initializes the library
Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SHOPIFY_API_SCOPES.split(','),
  HOST_NAME: process.env.SHOPIFY_APP_URL.replace(/^https:\/\//, ''),
  API_VERSION: ApiVersion.October20,
  IS_EMBEDDED_APP: true,
  // More information at https://github.com/Shopify/shopify-node-api/blob/main/docs/issues.md#notes-on-session-handling
  SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
});

// Storing the currently active shops in memory will force them to re-login when your server restarts. You should
// persist this object in your app.
const ACTIVE_SHOPIFY_SHOPS = {};

const app = new Koa();
const router = new Router();
app.keys = [Shopify.Context.API_SECRET_KEY];

app.use(session({ secure: true, sameSite: 'none' }, app))
// Sets up shopify auth
app.use(
  shopifyAuth({
    async afterAuth(ctx) {
      const { shop, accessToken } = ctx.state.shopify;
      ACTIVE_SHOPIFY_SHOPS[shop] = true;

      // Your app should handle the APP_UNINSTALLED webhook to make sure merchants go through OAuth if they reinstall it
      const response = await Shopify.Webhooks.Registry.register({
        shop,
        accessToken,
        path: "/webhooks",
        topic: "APP_UNINSTALLED",
        webhookHandler: async (topic, shop, body) => delete ACTIVE_SHOPIFY_SHOPS[shop],
      });

      if (!response.success) {
        console.log(
          `Failed to register APP_UNINSTALLED webhook: ${response.result}`
        );
      }

      // Redirect to app with shop parameter upon auth
      ctx.redirect(`/?shop=${shop}`);
    },
  }),
);

router.get("/", async (ctx) => {
  const shop = ctx.query.shop;

  ctx.session.shop = shop
  // console.log(shop)
  // If this shop hasn't been seen yet, go through OAuth to create a session
  if (ACTIVE_SHOPIFY_SHOPS[shop] === undefined) {
    ctx.redirect(`/auth?shop=${shop}`);
  } else {
    // Load app skeleton. Don't include sensitive information here!
    ctx.body = '🎉';
  }
});

router.post("/webhooks", async (ctx) => {
  try {
    await Shopify.Webhooks.Registry.process(ctx.req, ctx.res);
    console.log(`Webhook processed, returned status code 200`);
  } catch (error) {
    console.log(`Failed to process webhook: ${error}`);
  }
});

router.get('/api', async (ctx) => {
  
  console.log('session, ',ctx.session.shop)
  // const url = `https://${shop}/admin/api/2021-01/products.json`
  // const response = await axios(url)
  // console.log(response.data)
})

// Everything else must have sessions
router.get("(.*)", verifyRequest(), async (ctx) => {
  // Your application code goes here
});

app.use(router.allowedMethods());
app.use(router.routes());
app.listen(port, () => {
  console.log(`> Ready on http://localhost:${port}`);
});