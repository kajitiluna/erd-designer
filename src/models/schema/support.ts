export const arraysEqual = (first: readonly string[], second: readonly string[]): boolean => {
    return (first.length === second.length) && first.every((value, index) => (value === second[index]));
};
