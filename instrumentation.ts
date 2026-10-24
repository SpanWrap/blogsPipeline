export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureBoot } = await import("./src/api/router");
    ensureBoot();
  }
}
