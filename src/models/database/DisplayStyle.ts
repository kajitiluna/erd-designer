
export default class DisplayStyle {

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static readonly PHYSICAL = new DisplayStyle("Physical", (physicalName: string, _: string) => physicalName);

    public static readonly LOGICAL = new DisplayStyle("Logical", (_: string, logicalName: string) => logicalName);

    public static readonly BOTH = new DisplayStyle("Both", (physicalName: string, logicalName: string) => `${logicalName} / ${physicalName}`);

    private constructor(
        public readonly name: string,
        private readonly displayFunction: (physicalName: string, logicalName: string) => string
    ) { }

    public static values(): readonly DisplayStyle[] {
        return [DisplayStyle.PHYSICAL, DisplayStyle.LOGICAL, DisplayStyle.BOTH] as const;
    }

    public displayName(physicalName: string, logicalName: string): string {
        return this.displayFunction(physicalName, logicalName);
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

    public equals(other: DisplayStyle): boolean {
        return this.name === other.name;
    }
}