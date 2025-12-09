import RegalTextPanel from "~/features/regal/RegalTextPanel";

const privacyPolicy = `
# ERD Designer | プライバシーポリシー

**※ 本書は日本語および英語で記載されていますが、解釈に関しては日本語版を優先します。**

本プライバシーポリシーは、本サービスにおける利用者のデータおよびファイルの取り扱いについて説明するものです。

## 個人情報の収集について

- 本サービスは、ログインや認証の仕組みを必要としないため、利用者の個人情報を一切収集しません。

## データアクセスと利用目的

- 利用者が本サービスを Google ドライブアプリとして利用する場合、Google OAuth 認可を通じて**利用者が明示的に許可したファイルのみ**を参照および更新します。
- アクセスされたデータは、ER 図の読み込み・保存のためにのみ利用されます。
- 利用者のファイルの内容は、本サービス内での操作に限定され、別システムやサーバーへ送信されることはありません。

## データの保存

- 本サービスは、開発者または第三者のサーバーに利用者のデータを保存しません。  
- Google Drive 上のファイルは利用者自身のストレージに保存されます。  
- Google Drive 以外での利用時は、すべてのデータが利用者のローカルマシンにのみ保存されます。

## データの共有

本サービスは、利用者のデータやファイルを第三者に提供することは一切ありません。

## セキュリティ

本サービスは、Google が提供する OAuth 2.0 認証を使用し、安全な通信経路（HTTPS）を通じてデータアクセスを行います。

## お問い合わせ

プライバシーポリシーに関するご意見やご質問がある場合は、以下までご連絡ください。

- GitHub Issue ページ: https://github.com/kajitiluna/erd-designer/issues

## 改定履歴

- 制定日：2025 年 03 月 29 日
- 改定日：2025 年 11 月 06 日
  - 改定内容：データアクセス範囲、保存ポリシー、サポート連絡先の明確化。


---


# ERD Designer | Privacy Policy (English)

**※ This document is provided in both Japanese and English. In case of any inconsistency or ambiguity in interpretation, the Japanese version shall prevail.**

This Privacy Policy describes how the Service handles user data and files.

## Collection of Personal Information

- The Service does not collect any personal information since it does not require a login or any form of authentication.

## Data Access and Purpose of Use

- When used as a Google Drive App, the Service accesses only the files explicitly selected by the User via Google OAuth authorization.  
- The accessed data is used solely for reading and saving ER diagrams.  
- When the Service is used outside of the Google Drive App, any data created by the User is stored solely on the User's local machine and is not saved on any Internet-connected servers.

## Data Storage

- The Service does not store any user data on the developer’s or any third party’s servers.  
- Files edited in Google Drive remain in the User’s own Drive account.  
- When used outside Google Drive, all data is stored only on the User’s local machine.

## Data Sharing

The Service does not share any user data or files with third parties.

## Security

The Service uses Google’s OAuth 2.0 authentication and accesses data securely through encrypted HTTPS communication.

## Contact

If you have any questions or feedback regarding this Privacy Policy, please contact us at:

- GitHub Issues: https://github.com/kajitiluna/erd-designer/issues

## Revision History

- Established: 2025-03-29
- Revised: 2025-11-06
  - Summary of Revisions: Clarified the scope of data access, storage policy, and support contact information.
`;

const PrivacyPolicyPanel = () => {
    return (
        <RegalTextPanel markdown={privacyPolicy} />
    );
}

export default PrivacyPolicyPanel;