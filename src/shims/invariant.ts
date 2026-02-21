export default function invariant(condition: any, format?: string, ...args: any[]) {
  if (!condition) {
    let error: Error;
    if (format === undefined) {
      error = new Error(
        'Minified exception occurred; use the non-minified dev environment ' +
        'for the full error message and additional helpful warnings.'
      );
    } else {
      let argIndex = 0;
      error = new Error(
        format.replace(/%s/g, () => args[argIndex++])
      );
      error.name = 'Invariant Violation';
    }
    (error as any).framesToPop = 1; // we don't care about invariant's own frame
    throw error;
  }
}
