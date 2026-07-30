import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

import GitHubLinkButton from "~/features/start_up/GitHubLinkButton";

describe("GitHubLinkButton", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("links to the repository", () => {
        stubFetchResponse({ ok: true, body: { stargazers_count: 16 } });

        render(<GitHubLinkButton />);

        const link = screen.getByRole("link", { name: /Star on GitHub/ });
        expect(link).toHaveAttribute("href", "https://github.com/kajitiluna/erd-designer");
    });

    it("shows the star count once it resolves", async () => {
        stubFetchResponse({ ok: true, body: { stargazers_count: 16 } });

        render(<GitHubLinkButton />);

        await waitFor(() => {
            expect(screen.getByText("16")).toBeInTheDocument();
        });
    });

    it("abbreviates counts of a thousand or more", async () => {
        stubFetchResponse({ ok: true, body: { stargazers_count: 1234 } });

        render(<GitHubLinkButton />);

        await waitFor(() => {
            expect(screen.getByText("1.2k")).toBeInTheDocument();
        });
    });

    // The unauthenticated GitHub API is rate limited per client IP, so every failure mode below is
    // an expected outcome. None of them may take the repository link down with them.
    it("still renders the link when the API responds with an error status", async () => {
        stubFetchResponse({ ok: false, body: {} });

        render(<GitHubLinkButton />);

        await waitFor(() => {
            expect(screen.getByRole("link", { name: /Star on GitHub/ })).toBeInTheDocument();
        });
        expect(screen.queryByText(/^\d/)).not.toBeInTheDocument();
    });

    it("still renders the link when the request rejects", async () => {
        const rejectingFetch = vi.fn().mockRejectedValue(new Error("network down"));
        vi.stubGlobal("fetch", rejectingFetch);

        render(<GitHubLinkButton />);

        await waitFor(() => {
            expect(rejectingFetch).toHaveBeenCalled();
        });
        expect(screen.getByRole("link", { name: /Star on GitHub/ })).toBeInTheDocument();
        expect(screen.queryByText(/^\d/)).not.toBeInTheDocument();
    });

    it("still renders the link when the payload has no star count", async () => {
        stubFetchResponse({ ok: true, body: {} });

        render(<GitHubLinkButton />);

        await waitFor(() => {
            expect(screen.getByRole("link", { name: /Star on GitHub/ })).toBeInTheDocument();
        });
        expect(screen.queryByText(/^\d/)).not.toBeInTheDocument();
    });
});

type StubResponse = {
    ok: boolean;
    body: { stargazers_count?: number };
};

const stubFetchResponse = (response: StubResponse) => {
    const fetchStub = vi.fn().mockResolvedValue({
        ok: response.ok,
        json: () => { return Promise.resolve(response.body); },
    });
    vi.stubGlobal("fetch", fetchStub);
};
