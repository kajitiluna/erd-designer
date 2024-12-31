
export default class DisplayStyle {

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static readonly PHYSICAL = new DisplayStyle("Physical", (pyhisicalName: string, _: string) => pyhisicalName);

    public static readonly LOGICAL = new DisplayStyle("Logical", (_: string, logicalName: string) => logicalName);

    public static readonly BOTH = new DisplayStyle("Both", (pyhisicalName: string, logicalName: string) => `${logicalName} / ${pyhisicalName}`);

    private constructor(
        public readonly name: string,
        private readonly displayFunction: (pyhisicalName: string, logicalName: string) => string
    ) { }

    public static values(): readonly DisplayStyle[] {
        return [DisplayStyle.PHYSICAL, DisplayStyle.LOGICAL, DisplayStyle.BOTH] as const;
    }

    public displayName(pyhisicalName: string, logicalName: string): string {
        return this.displayFunction(pyhisicalName, logicalName);
    }

    public toJSON(): Record<string, string> {
        return { styleName: this.name };
    }

    public static toObject(obj: object): DisplayStyle {
        if (!("styleName" in obj)) {
            return DisplayStyle.BOTH;
        }

        const styleName = obj.styleName as string;
        for (const style of Object.values(DisplayStyle)) {
            if (style.name === styleName) {
                return style;
            }
        }

        return DisplayStyle.BOTH;
    }
}