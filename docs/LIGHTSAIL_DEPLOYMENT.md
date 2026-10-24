# Deploy to AWS Lightsail

The GitHub Actions workflow deploys this app to a small Lightsail Linux
instance over SSH and runs it with **PM2** (no Docker). CI builds the Next.js
standalone release so the 512MB instance never has to compile on the box.

## 1. Prepare the Lightsail instance

Create a Debian or Ubuntu instance, attach a static IP, and allow TCP port
`3000` in the Lightsail networking firewall.

Install Node.js 24, PM2, and rsync. On Debian with NodeSource already
configured:

```bash
sudo apt-get update
sudo apt-get install -y rsync
node -v   # should be v24.x
sudo npm install -g pm2
pm2 -v
```

If Node is missing, follow the NodeSource Node 24 install for Debian/Ubuntu,
then install PM2 as above.

Add a small swap file so occasional spikes do not OOM-kill the process:

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Enable PM2 to start on boot (run once, then paste the command it prints):

```bash
pm2 startup
# sudo env PATH=... pm2 startup systemd -u <your-user> --hp /home/<your-user>
pm2 save
```

For a public production domain, put a TLS reverse proxy in front of port 3000
and restrict the Lightsail firewall after HTTPS is configured.

## 2. Add GitHub configuration

Repository: [SpanWrap/blogsPipeline](https://github.com/SpanWrap/blogsPipeline).

Create the environment **production**
([environments](https://github.com/SpanWrap/blogsPipeline/settings/environments)),
then add these secrets on that environment
([environment secrets](https://github.com/SpanWrap/blogsPipeline/settings/environments)):

- `LIGHTSAIL_HOST`: `13.234.23.23`
- `LIGHTSAIL_USER`: `ubuntu`
- `LIGHTSAIL_SSH_PRIVATE_KEY`: the full Lightsail `.pem` file, including the
  BEGIN and END lines. Do not commit that file.
- `LIGHTSAIL_KNOWN_HOSTS`: the ed25519 host key for `13.234.23.23`.
  Fingerprint `SHA256:ZUycJjZ9Gc9PPprwti1tcXoivOW2s7tDTtfA9xktvtc`.
- `LIGHTSAIL_ENV_FILE`: the complete production `.env`. Optional after the
  first deploy; when omitted, the server `.env` is left as it is.

Do **not** put `.env` contents in an Actions variable. Put them only in the
`LIGHTSAIL_ENV_FILE` secret.

Leave the variable `LIGHTSAIL_DEPLOY_PATH` unset, or set it to exactly
`/home/ubuntu/pipeline`. Anything with `=` or more than one line is rejected.
The app already runs at that path. This workflow does not change nginx or the
other site on the instance.

At minimum, put this in the `LIGHTSAIL_ENV_FILE` secret (not in
`LIGHTSAIL_DEPLOY_PATH`):

```dotenv
NODE_ENV=production
PORT=3000
AUTH_SECRET=replace-with-openssl-rand-hex-32
PIPELINE_PUBLIC_URL=https://pipeline.spanwrap.com
```

Generate a real `AUTH_SECRET` with `openssl rand -hex 32`. Add the storage and
provider credentials described in `.env.example`. Runtime data lives in
`$DEPLOY_PATH/.data` and is preserved across deploys.

## 3. Deploy

Push to `main`, or run **Deploy to AWS Lightsail** from the Actions tab.
Nginx on the instance already serves https://pipeline.spanwrap.com and proxies
to the app on port 3000. The workflow only replaces `/home/ubuntu/pipeline`
and reloads PM2.

Useful server commands:

```bash
cd ~/pipeline
pm2 status
pm2 logs pipeline
pm2 restart pipeline
```
