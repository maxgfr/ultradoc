import { describe, expect, it } from "vitest";
import { soItems } from "../src/sources/stackoverflow.js";

describe("soItems (StackExchange JSON → evidence)", () => {
  it("maps questions to so:<id> evidence with title/tags/score", () => {
    const data = {
      items: [
        {
          question_id: 11227809,
          title: "Why is processing a sorted array faster?",
          body: "<p>Here is some <b>C++</b> code.</p>",
          link: "https://stackoverflow.com/q/11227809",
          score: 27000,
          is_answered: true,
          answer_count: 25,
          tags: ["c++", "performance", "branch-prediction"],
        },
      ],
    };
    const items = soItems(data);
    expect(items).toHaveLength(1);
    const it0 = items[0]!;
    expect(it0.source).toBe("so");
    expect(it0.ref).toBe("so:11227809");
    expect(it0.url).toBe("https://stackoverflow.com/q/11227809");
    expect(it0.title).toBe("Why is processing a sorted array faster?");
    expect(it0.snippet).toContain("answered");
    expect(it0.snippet).toContain("tags: c++, performance, branch-prediction");
    expect(it0.snippet).toContain("C++ code."); // html stripped
    expect(it0.meta).toMatchObject({ questionId: 11227809, isAnswered: true, answerCount: 25 });
  });

  it("handles missing fields and an empty item list", () => {
    expect(soItems({})).toEqual([]);
    const [it0] = soItems({ items: [{ question_id: 1 }] });
    expect(it0!.ref).toBe("so:1");
    expect(it0!.snippet).toContain("unanswered");
    expect(it0!.snippet).toContain("(no body)");
  });
});
