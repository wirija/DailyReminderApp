"""Read-only adapters. All requests are GET, and credentials never follow redirects."""
from urllib.parse import quote, urlsplit

import httpx


class ConnectorError(ValueError):
    pass


def validate_base_url(value):
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ConnectorError("Use an HTTP or HTTPS server URL without credentials, query or fragment.")
    return value.rstrip("/")


def checked_json(response):
    if response.status_code in (401, 403):
        raise ConnectorError("Access was denied. Check the connection credential and read permissions.")
    if response.status_code == 404:
        raise ConnectorError("Repository or board was not found. Check its ID and your access.")
    if response.status_code >= 300:
        raise ConnectorError(f"The board server returned HTTP {response.status_code}. Check the server address and retry.")
    try:
        return response.json()
    except ValueError as exc:
        raise ConnectorError("The board server did not return valid JSON.") from exc


def fetch_issues(connection, transport=None):
    base = validate_base_url(connection.base_url)
    token = connection.get_token()
    if not token:
        raise ConnectorError("Add a read-only access credential before pulling board items.")
    if connection.provider == "gitlab":
        return GitLab(base, connection.resource, token, transport).issues()
    if connection.provider == "jira":
        return Jira(base, connection.resource, token, connection.username, transport).issues()
    raise ConnectorError("Unsupported board provider.")


class GitLab:
    def __init__(self, base, resource, token, transport=None):
        self.base = base
        self.resource = resource
        self.client = httpx.Client(headers={"PRIVATE-TOKEN": token}, timeout=30, follow_redirects=False, transport=transport)

    def issues(self):
        results = []
        with self.client as client:
            for page in range(1, 101):
                response = client.get(f"{self.base}/api/v4/projects/{quote(self.resource, safe='')}/issues", params={"scope": "all", "state": "all", "per_page": 100, "page": page})
                rows = checked_json(response)
                if not isinstance(rows, list):
                    raise ConnectorError("GitLab returned an unexpected issue list.")
                for row in rows:
                    results.append({"external_id": str(row["id"]), "key": f"#{row['iid']}", "title": row["title"], "status": row["state"], "assignees": [a.get("name") or a.get("username", "") for a in row.get("assignees", [])], "due_date": row.get("due_date"), "url": row.get("web_url", ""), "source_updated_at": row.get("updated_at", ""), "raw": row})
                if not response.headers.get("X-Next-Page") and len(rows) < 100:
                    return results
                if response.headers.get("X-Next-Page") == "":
                    return results
        raise ConnectorError("This repository has more than 10,000 issues. Use a smaller repository connection.")


class Jira:
    def __init__(self, base, resource, token, username="", transport=None):
        if not str(resource).isdigit():
            raise ConnectorError("Jira board ID must be a number.")
        self.base, self.resource = base, resource
        headers = {} if username else {"Authorization": f"Bearer {token}"}
        self.client = httpx.Client(headers=headers, auth=(username, token) if username else None, timeout=30, follow_redirects=False, transport=transport)

    def issues(self):
        results = []
        with self.client as client:
            for page in range(100):
                start = page * 100
                response = client.get(f"{self.base}/rest/agile/1.0/board/{self.resource}/issue", params={"startAt": start, "maxResults": 100, "fields": "summary,status,assignee,duedate,updated"})
                body = checked_json(response)
                rows = body.get("issues") if isinstance(body, dict) else None
                if not isinstance(rows, list):
                    raise ConnectorError("Jira returned an unexpected issue list.")
                for row in rows:
                    fields = row.get("fields", {})
                    person = fields.get("assignee") or {}
                    results.append({"external_id": str(row["id"]), "key": row["key"], "title": fields.get("summary", ""), "status": (fields.get("status") or {}).get("name", ""), "assignees": [person.get("displayName", "")] if person else [], "due_date": fields.get("duedate"), "url": f"{self.base}/browse/{quote(row['key'], safe='')}", "source_updated_at": fields.get("updated", ""), "raw": row})
                if body.get("isLast") or start + len(rows) >= body.get("total", float("inf")) or not rows:
                    return results
                # Jira can cap a requested page size. Advance by the server's actual size.
                if len(rows) < 100:
                    return self._remaining(client, results, start + len(rows))
        raise ConnectorError("This board has more than 10,000 issues. Narrow the board filter.")

    def _remaining(self, client, results, start):
        while len(results) < 10000:
            response = client.get(f"{self.base}/rest/agile/1.0/board/{self.resource}/issue", params={"startAt": start, "maxResults": 100, "fields": "summary,status,assignee,duedate,updated"})
            body = checked_json(response)
            rows = body.get("issues", [])
            for row in rows:
                fields, person = row.get("fields", {}), row.get("fields", {}).get("assignee") or {}
                results.append({"external_id": str(row["id"]), "key": row["key"], "title": fields.get("summary", ""), "status": (fields.get("status") or {}).get("name", ""), "assignees": [person.get("displayName", "")] if person else [], "due_date": fields.get("duedate"), "url": f"{self.base}/browse/{quote(row['key'], safe='')}", "source_updated_at": fields.get("updated", ""), "raw": row})
            start += len(rows)
            if not rows or body.get("isLast") or start >= body.get("total", float("inf")):
                return results
        raise ConnectorError("This board has more than 10,000 issues. Narrow the board filter.")
