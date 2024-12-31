const download = (fileName: string, content: Blob | string) => {
    const downloadLink = document.createElement("a");
    downloadLink.download = fileName;
    const ref = (typeof content === "string") ? content : URL.createObjectURL(content);
    downloadLink.href = ref;

    downloadLink.click();
    URL.revokeObjectURL(downloadLink.href);
};

export default download;
