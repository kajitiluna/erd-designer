
export default class DisplayNameStyle {

    public static readonly PHYSICAL =
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        new DisplayNameStyle("Physical", (physicalName: string, _: string) => physicalName);

    public static readonly LOGICAL = new DisplayNameStyle("Logical", (_: string, logicalName: string) => logicalName);

    public static readonly BOTH =
        new DisplayNameStyle("Both", (physicalName: string, logicalName: string) => `${logicalName} / ${physicalName}`);

    private constructor(
        public readonly name: string,
        private readonly displayFunction: (physicalName: string, logicalName: string) => string
    ) { }

    public static values(): readonly DisplayNameStyle[] {
        return [DisplayNameStyle.PHYSICAL, DisplayNameStyle.LOGICAL, DisplayNameStyle.BOTH] as const;
    }

    public displayName(physicalName: string, logicalName: string): string {
        return this.displayFunction(physicalName, logicalName);
    }

    public toJSON(): Record<string, string> {
        return { styleName: this.name };
    }

    public static toObject(obj: object): DisplayNameStyle {
        if (("styleName" in obj) === false) {
            return DisplayNameStyle.BOTH;
        }

        const styleName = obj.styleName as string;
        for (const style of Object.values(DisplayNameStyle)) {
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