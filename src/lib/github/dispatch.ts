export async function dispatchProcessJob(jobId: string) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GH_DISPATCH_TOKEN || process.env.GH_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("Missing GitHub dispatch configuration (GITHUB_OWNER, GITHUB_REPO, GITHUB_DISPATCH_TOKEN/GITHUB_TOKEN)");
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      event_type: "process_job",
      client_payload: { jobId }
    })
  });

  if (!res.ok) {
    const body = await res.text();
    const acceptedPerms = res.headers.get("x-accepted-github-permissions");
    throw new Error(
      `GitHub dispatch failed (${res.status}): ${body}${acceptedPerms ? `; accepted_permissions=${acceptedPerms}` : ""}`
    );
  }
}
