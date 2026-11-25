"use strict";

const ExcelReport = (() => {
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const TYPES = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  function escapeXml(value) {
    return String(value).replace(/[&<>]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
    })[character]);
  }

  function worksheet(report) {
    const rows = [
      { values: ["국내 출장여비 계산 결과"], style: 1 },
      ...report.details.map((values) => ({ values, style: 0 })),
      { values: ["지급 항목", "예상 지급액 (원)"], style: 1 },
      ...report.lines.map((values) => ({ values, style: 0 })),
      { values: ["예상 지급 합계", report.total], style: 3 },
    ];
    const rowXml = rows.map(({ values, style }, rowIndex) => {
      const row = rowIndex + 1;
      const cells = values.map((value, column) => {
        const reference = (column === 0 ? "A" : "B") + row;
        if (typeof value === "number") {
          return `<c r="${reference}" s="${style === 3 ? 4 : 2}"><v>${value}</v></c>`;
        }
        return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      }).join("");
      return `<row r="${row}">${cells}</row>`;
    }).join("");
    return `<worksheet xmlns="${MAIN}">
      <cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="39" customWidth="1"/></cols>
      <sheetData>${rowXml}</sheetData>
      <mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
    </worksheet>`;
  }

  function styles() {
    return `<styleSheet xmlns="${MAIN}">
      <fonts count="3">
        <font><sz val="11"/><name val="맑은 고딕"/></font>
        <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>
        <font><b/><sz val="11"/><color rgb="FF0B263D"/><name val="맑은 고딕"/></font>
      </fonts>
      <fills count="4">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="gray125"/></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FF0B2B46"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFEAF6F5"/><bgColor indexed="64"/></patternFill></fill>
      </fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="5">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
        <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
        <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
        <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
        <xf numFmtId="3" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
      </cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`;
  }

  async function download(report) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="${TYPES}.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TYPES}.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="${TYPES}.styles+xml"/>
    </Types>`);
    zip.file("_rels/.rels", XML + `<Relationships xmlns="${PACKAGE_REL}">
      <Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`);
    zip.file("xl/workbook.xml", XML + `<workbook xmlns="${MAIN}" xmlns:r="${REL}">
      <sheets><sheet name="출장여비" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", XML + `<Relationships xmlns="${PACKAGE_REL}">
      <Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>
    </Relationships>`);
    zip.file("xl/worksheets/sheet1.xml", XML + worksheet(report));
    zip.file("xl/styles.xml", XML + styles());

    const file = await zip.generateAsync({ type: "blob", mimeType: XLSX_MIME });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `출장여비_${report.start}_${report.end}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return { download };
})();
