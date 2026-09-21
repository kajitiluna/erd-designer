
export default class DisplayNameStyle {

    public static readonly PHYSICAL = new DisplayNameStyle(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        "Physical", (physicalName: string, _: string) => physicalName, false
    );

    public static readonly LOGICAL = new DisplayNameStyle(
        "Logical", (_: string, logicalName: string) => logicalName, true
    );

    public static readonly BOTH = new DisplayNameStyle(
        "Both", (physicalName: string, logicalName: string) => `${logicalName} / ${physicalName}`, true
    );

    private constructor(
        public readonly name: string,
        private readonly displayFunction: (physicalName: string, logicalName: string) => string,
        private readonly logicalNameIncluded: boolean
    ) { }

    public static values(): readonly DisplayNameStyle[] {
        return [DisplayNameStyle.PHYSICAL, DisplayNameStyle.LOGICAL, DisplayNameStyle.BOTH] as const;
    }

    public displayName(physicalName: string, logicalName: string): string {
        return this.displayFunction(physicalName, logicalName);
    }

    /** Whether this style shows the logical name, so callers can drop logical-name UI when it does not. */
    public withLogicalName(): boolean {
        return this.logicalNameIncluded;
    }

    public toJSON(): Record<string, string> {
        return { styleName: this.name };
    }

    public static toObject(obj: object): DisplayNameStyle {
        if (("styleName" in obj) === false) {
            return DisplayNameStyle.BOTH;
        }

        const styleName = obj.styleName as string;
        for (const style of DisplayNameStyle.values()) {
            if (style.name === styleName) {
                return style;
            }
        }

        return DisplayNameStyle.BOTH;
    }

    public equals(other: DisplayNameStyle): boolean {
        return this.name === other.name;
    }
}
