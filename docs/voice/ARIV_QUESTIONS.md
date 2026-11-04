# Questions for Ariv

The agent says "not in my notes" for everything below. Nothing here has been invented in the meantime. Answers go into `web/lib/knowledge.ts`. Ordered by how much each would help on a real call.

## Would change what recruiters hear

1. **What was your actual title at Hyundai?** The agent now says you did real software engineering work there, and that only the title was different. It can't say what the title was.
2. **At Hyundai, what did the model or service do, and who used it?** "Python and TensorFlow for a vehicle-data team" is true but thin. One plain sentence on the result would answer "has he built anything real?" No numbers unless you can back them up.
3. **What are the engineering problems you've picked up at INZI?** Your sheet says you noticed them and took them on. Without one example that doesn't touch a customer, program or part, the agent can only say it happened.
4. **One story where you owned something end to end and it almost failed.** Doubtful callers now get evidence instead of a calendar link, and the agent has very few stories to use.
5. **Any metric you'd stand behind?** Every old resume number stays out. If one can be proven, name it and the source.

## Would stop "not in my notes"

6. **Rust, Go, Kubernetes, fine-tuning, model training:** the agent now says you've used them and adds nothing else. Where and on what? Engineers will ask the next question.
7. **Hometown.** The agent says it's not in its notes.
8. **Do you have engineering opinions you want it to give?** RAG or fine-tuning, which framework, which model. The probe caught it inventing "prefers RAG", so it now says nothing. If you have views, give them in your words.
9. **GPA, graduation years, and anything notable from Northeastern or SRM** (awards, thesis, capstone).
10. **Can the agent say you're actively looking?** It says only that you're open to the right role.

## Logistics callers keep asking

11. **Remote, hybrid or on-site, and how soon could you start?** The agent sends these to you.
12. **Is the resume email still your preferred route?** The agent says you're happy to email it, and it can't send a file. arivfolio.tech was down on 2026-09-29; is it back?

## Decisions the PM made for you, to confirm

13. **English only.** A Spanish caller now gets one line in English. Your Korean work makes this worth a thought: Malbit is a good story, and a Korean-speaking caller gets the same line.
14. **General AI questions only through your work.** "What's the difference between RAG and fine-tuning?" gets no lecture. For an engineer that can feel evasive. If you'd rather it answer in one line, say so.
15. **Should the agent name its model?** It now says Gemini Live and `gemini-3.8-live` when asked, because engineers ask, the repo is public, and the vague answer failed the probe.
