# Deploy to AWS Lightsail

The GitHub Actions workflow deploys this app to a standard Lightsail Linux
instance over SSH and runs it with Docker Compose. It runs type-checks, tests,
and a production build before changing the server.

## 1. Prepare the Lightsail instance

Create a Debian or Ubuntu instance, attach a static IP, and allow TCP port
`3000` in its Lightsail networking firewall. The following commands configure
Docker's official APT repository on Debian:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl rsync
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Sign out and reconnect so the Docker group change takes effect. Confirm that
`docker version`, `docker compose version`, and `rsync --version` work without
`sudo`. For Ubuntu, use the equivalent official
[Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/).

For a public production domain, put a TLS reverse proxy in front of port 3000
and restrict the Lightsail firewall after HTTPS is configured.

## 2. Add GitHub configuration

In the repository's **Settings → Secrets and variables → Actions**, add these
repository or `production` environment secrets:

- `LIGHTSAIL_HOST`: the instance's static IP or hostname.
- `LIGHTSAIL_USER`: the SSH user, commonly `ubuntu`.
- `LIGHTSAIL_SSH_PRIVATE_KEY`: the full contents of the Lightsail `.pem` key.
- `LIGHTSAIL_KNOWN_HOSTS`: the verified SSH host-key line. Generate a candidate
  with `ssh-keyscan -H <static-ip>` and compare its fingerprint with the host
  before saving it.
- `LIGHTSAIL_ENV_FILE`: the complete production `.env` contents (secret).
  This is optional after the first deploy; when omitted, the existing server
  `.env` remains unchanged.

Do **not** put `.env` contents in an Actions variable. Put them only in the
`LIGHTSAIL_ENV_FILE` secret.

Optionally add the Actions variable `LIGHTSAIL_DEPLOY_PATH`. It must be a
single absolute path such as `/home/jai/pipeline`. Leave it unset to use
`/home/<LIGHTSAIL_USER>/pipeline`.

At minimum, put this in the `LIGHTSAIL_ENV_FILE` secret (not in
`LIGHTSAIL_DEPLOY_PATH`):

```dotenv
NODE_ENV=production
APP_PORT=3000
AUTH_SECRET=replace-with-openssl-rand-hex-32
AUTH_URL=http://YOUR_STATIC_IP:3000
PIPELINE_PUBLIC_URL=http://YOUR_STATIC_IP:3000
```

Add the storage and provider credentials described in `.env.example`. File
storage is persisted in the Docker volume `pipeline_data`; MongoDB or S3 can
still be selected with `STORAGE_BACKEND`.

## 3. Deploy

Push to `main`, or run **Deploy to AWS Lightsail** from the GitHub Actions tab.
The app will be available at `http://<static-ip>:3000`.

Useful server commands:

```bash
cd ~/pipeline
docker compose ps
docker compose logs -f app
docker compose restart app
```
