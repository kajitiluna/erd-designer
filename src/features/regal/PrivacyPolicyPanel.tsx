import RegalTextPanel from "~/features/regal/RegalTextPanel";

const privacyPolicy = `
# ERD Designer | プライバシーポリシー

**※ 本書は日本語および英語で記載されていますが、解釈に関しては日本語版を優先します。**

本プライバシーポリシーは、本サービスにおける利用者のデータおよびファイルの取り扱いについて説明するものです。

## 個人情報の収集について

- 本サービスは、ログインや認証の仕組みを必要としないため、利用者の個人情報を一切収集しません。

## Google ドライブアプリとしての利用時

- 利用者が本サービスを Google ドライブアプリとして利用する場合、**利用者が明示的に許可したファイルのみ**を参照および更新します。
- 利用者のファイルの内容は、本サービス内での操作に限定され、別システムやサーバーへ保存されることはありません。
- 本サービスは、利用者のファイルを第三者に提供することは一切ありません。

## Google ドライブアプリ以外での利用時

- Google ドライブアプリ以外で利用する場合、利用者が作成したデータは利用者のローカルマシンにのみ保存され、インターネット上のサーバー等には保存されません。

## お問い合わせ

プライバシーポリシーに関するご意見やご質問がある場合は、開発者までご連絡ください。

---

# ERD Designer | Privacy Policy (English)

**※ This document is provided in both Japanese and English. In case of any inconsistency or ambiguity in interpretation, the Japanese version shall prevail.**

This Privacy Policy describes how the Service handles user data and files.

## Collection of Personal Information

- The Service does not collect any personal information since it does not require a login or any form of authentication.

## When Using as a Google Drive App

- When Users utilize the Service as a Google Drive App, only the files explicitly authorized by the User will be accessed and updated.
- The contents of the User's files are limited to operations within the Service and are not stored on any separate system or server.
- The Service does not provide the User's files to any third party.

## When Not Using as a Google Drive App

- When the Service is used outside of the Google Drive App, any data created by the User is stored solely on the User's local machine and is not saved on any Internet-connected servers.

## Contact

If you have any questions or feedback regarding this Privacy Policy, please contact the Developer.
`;

const PrivacyPolicyPanel = () => {
    return (
        <RegalTextPanel markdown={privacyPolicy} />
    );
}

export default PrivacyPolicyPanel;