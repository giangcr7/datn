import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";

@Info({
  title: "CertContract",
  description:
    "Smart contract cho hệ thống cấp phát văn bằng TLU - Đã bổ sung MSSV",
})
export class CertContract extends Contract {
  private anchorKey(ctx: Context, uuid: string, version: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uuid,
      ) ||
      !/^[1-9]\d*$/.test(version)
    )
      throw new Error("Invalid diploma identifier");
    return ctx.stub.createCompositeKey("diploma-anchor", [uuid, version]);
  }

  private authorizeAnchor(ctx: Context, issuerMspId: string) {
    if (
      !["Org1MSP", "Org2MSP"].includes(issuerMspId) ||
      ctx.clientIdentity.getMSPID() !== issuerMspId
    )
      throw new Error("Issuer MSP mismatch");
    if (!ctx.clientIdentity.assertAttributeValue("diploma.issuer", "true"))
      throw new Error("Identity is not an authorized diploma issuer");
  }

  @Transaction()
  @Returns("string")
  public async AnchorDiploma(
    ctx: Context,
    uuid: string,
    version: string,
    schemaVersion: string,
    payloadHash: string,
    issuerMspId: string,
  ): Promise<string> {
    this.authorizeAnchor(ctx, issuerMspId);
    if (schemaVersion !== "diploma-v1" || !/^[0-9a-f]{64}$/.test(payloadHash))
      throw new Error("Invalid anchor hash or schema version");
    const key = this.anchorKey(ctx, uuid, version);
    const bytes = await ctx.stub.getState(key);
    if (bytes?.length) {
      const existing = JSON.parse(Buffer.from(bytes).toString());
      if (
        existing.payloadHash !== payloadHash ||
        existing.issuerMspId !== issuerMspId
      )
        throw new Error("Anchor conflict");
      return JSON.stringify({
        success: true,
        txId: existing.issueTxId,
        hash: existing.payloadHash,
        idempotent: true,
      });
    }
    const timestamp = ctx.stub.getTxTimestamp();
    const record = {
      docType: "diploma-anchor",
      uuid,
      version: Number(version),
      schemaVersion,
      payloadHash,
      issuerMspId,
      issueTxId: ctx.stub.getTxID(),
      issuedAt: new Date(
        Number(timestamp.seconds.toString()) * 1000 +
          Math.floor(timestamp.nanos / 1000000),
      ).toISOString(),
      isRevoked: false,
    };
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent(
      "DiplomaAnchored",
      Buffer.from(
        JSON.stringify({ uuid, version: Number(version), payloadHash }),
      ),
    );
    return JSON.stringify({
      success: true,
      txId: ctx.stub.getTxID(),
      hash: payloadHash,
    });
  }

  @Transaction()
  @Returns("string")
  public async RevokeDiplomaAnchor(
    ctx: Context,
    uuid: string,
    version: string,
    reasonHash: string,
  ): Promise<string> {
    if (!/^[0-9a-f]{64}$/.test(reasonHash))
      throw new Error("Invalid reason hash");
    const key = this.anchorKey(ctx, uuid, version);
    const bytes = await ctx.stub.getState(key);
    if (!bytes?.length) throw new Error("Anchor not found");
    const record = JSON.parse(Buffer.from(bytes).toString());
    this.authorizeAnchor(ctx, record.issuerMspId);
    if (record.isRevoked) {
      if (record.reasonHash !== reasonHash)
        throw new Error("Revocation conflict");
      return JSON.stringify({
        success: true,
        txId: record.revokeTxId,
        idempotent: true,
      });
    }
    const timestamp = ctx.stub.getTxTimestamp();
    record.isRevoked = true;
    record.reasonHash = reasonHash;
    record.revokeTxId = ctx.stub.getTxID();
    record.revokedAt = new Date(
      Number(timestamp.seconds.toString()) * 1000 +
        Math.floor(timestamp.nanos / 1000000),
    ).toISOString();
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent(
      "DiplomaRevoked",
      Buffer.from(
        JSON.stringify({ uuid, version: Number(version), reasonHash }),
      ),
    );
    return JSON.stringify({ success: true, txId: ctx.stub.getTxID() });
  }

  @Transaction(false)
  @Returns("string")
  public async QueryDiplomaAnchor(
    ctx: Context,
    uuid: string,
    version: string,
  ): Promise<string> {
    const bytes = await ctx.stub.getState(this.anchorKey(ctx, uuid, version));
    if (!bytes?.length) throw new Error("Anchor not found");
    return Buffer.from(bytes).toString();
  }

  @Transaction()
  @Returns("string")
  public async InitLedger(ctx: Context): Promise<string> {
    console.info("============= TLU DIPLOMA SYSTEM INITIALIZED =============");
    return JSON.stringify({
      success: true,
      message: "Ledger Initialized Successfully!",
    });
  }

  @Transaction()
  @Returns("string")
  public async IssueCertificate(
    ctx: Context,
    certUUID: string,
    mssv: string,
    studentName: string,
    major: string,
    gpaStr: string,
    classification: string,
    issueDate: string,
    soHieu: string, // Tham số 8
    soVaoSo: string, // Tham số 9
    className: string, // Tham số 10
    namTotNghiep: string, // Tham số 11
  ): Promise<string> {
    throw new Error(
      "Legacy issuance is disabled. Use AnchorDiploma after reviewed database approval.",
    );
  }

  @Transaction()
  @Returns("string")
  public async RevokeCertificate(
    ctx: Context,
    certUUID: string,
    reason: string,
  ): Promise<string> {
    throw new Error(
      "Legacy revocation requires a separately reviewed cutover. Use RevokeDiplomaAnchor for normalized records.",
    );
  }

  @Transaction(false)
  @Returns("string")
  public async QueryCertificate(
    ctx: Context,
    certUUID: string,
  ): Promise<string> {
    const certAsBytes = await ctx.stub.getState(certUUID);
    if (!certAsBytes || certAsBytes.length === 0) {
      throw new Error(`[NOT FOUND] Certificate ${certUUID} does not exist!`);
    }
    return certAsBytes.toString();
  }

  @Transaction(false)
  @Returns("boolean")
  public async CertificateExists(
    ctx: Context,
    certUUID: string,
  ): Promise<boolean> {
    const certAsBytes = await ctx.stub.getState(certUUID);
    return certAsBytes && certAsBytes.length > 0;
  }

  @Transaction(false)
  @Returns("string")
  public async QueryAllCertificates(ctx: Context): Promise<string> {
    const allResults: any[] = [];
    const iterator = await ctx.stub.getStateByRange("", "");

    try {
      let result = await iterator.next();
      while (!result.done) {
        if (result.value && result.value.value) {
          const strValue = result.value.value.toString();
          try {
            const record = JSON.parse(strValue);
            if (record.docType === "certificate") {
              allResults.push({ Key: result.value.key, Record: record });
            }
          } catch (err) {
            /* Bỏ qua log lỗi để tránh nhiễu */
          }
        }
        result = await iterator.next();
      }
    } finally {
      await iterator.close();
    }
    return JSON.stringify(allResults);
  }
}
