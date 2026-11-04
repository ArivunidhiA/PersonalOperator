/**
 * Word lists shared by the live guard (browser) and the summary scrub (server):
 * which capitalized words are ordinary, so they're never taken for a company name.
 * Never put a confidential name here: a list that names it would confirm a guess.
 */
export const COMMON_WORDS = new Set(
  (
    "i a an the this that these those they he she it we you their his her caller callers asked asking wanted wants did do does is was were who what when where why how which and but or so if then also after before short call visitor recruiter " +
    "hi hello hey thanks am pm eastern central mountain pacific est cst mst pst " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december " +
    "yes yeah yep no nope okay ok oh um uh well great good nice cool awesome perfect sure right now just actually really maybe please sorry thank tell give show let can could would will should might are be been have has had don't doesn't didn't isn't wasn't " +
    "i'm i'd i'll i've it's that's there there's here what's who's how's let's my me mine our us your yours him them one two three first next last hold wait stop got get go going gonna wanna look listen bye goodbye morning afternoon evening today tomorrow yesterday any some all every not never always very much more most"
  ).split(" "),
);

/** Common tools and cities his notes may skip. */
export const COMMON_NAMES = new Set(
  "langgraph langchain llamaindex pytorch tensorflow react java javascript golang c++ sql postgres mongodb redis kafka terraform azure gcp django vue flutter gemini live api chicago seattle boston austin london".split(" "),
);
