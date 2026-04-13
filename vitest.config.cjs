/** @type {import('vitest/config').UserConfig} */
module.exports = {
  test: {
    pool: "threads",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
};
