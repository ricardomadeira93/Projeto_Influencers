export async function dispatchProcessJob(jobId: string) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("Missing GitHub dispatch configuration (GITHUB_OWNER, GITHUB_REPO, GITHUB_DISPATCH_TOKEN/GITHUB_TOKEN)");
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      event_type: "process_job",
      client_payload: { jobId }
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${body}`);
  }
}
