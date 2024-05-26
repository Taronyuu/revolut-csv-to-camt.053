const fs = require('fs');
const csv = require('csv-parser');
const xmlbuilder = require('xmlbuilder');

const iban = process.argv[2];
const name = process.argv[3];
const bic = process.argv[4];
const inputFile = process.argv[5];
const outputFile = process.argv[6];

if(!iban || !name || !bic || !inputFile || !outputFile) {
    console.log('Error: usage: node converter.js {iban} {name} {bic} {inputfile} {outputfile}');
    return;
}

const root = xmlbuilder.create('Document', {
  version: '1.0',
  encoding: 'UTF-8',
  standalone: true
});

root.attribute('xmlns', 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02');

const BkToCstmrStmt = root.ele('BkToCstmrStmt');
const GrpHdr = BkToCstmrStmt.ele('GrpHdr');
GrpHdr.ele('MsgId', 'STATEMENT001');
GrpHdr.ele('CreDtTm', new Date().toISOString());
const Stmt = BkToCstmrStmt.ele('Stmt');
const Acct = Stmt.ele('Acct');
Acct.ele('Id').ele('IBAN', iban);
Acct.ele('Ownr').ele('Nm', name);
Acct.ele('Svcr').ele('FinInstnId').ele('BIC', bic);

let startBalance = 0;
let endBalance = 0;

fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    const amount = parseFloat(row['Amount']);
    if (!isNaN(amount)) {
      const Ntry = Stmt.ele('Ntry');
      const BookgDt = Ntry.ele('BookgDt').ele('Dt');
      BookgDt.text(row['Date started (UTC)']);
      const ValDt = Ntry.ele('ValDt').ele('Dt');
      ValDt.text(row['Date completed (UTC)']);
      const Amt = Ntry.ele('Amt').att('Ccy', row['Orig currency']);
      Amt.text(row['Amount']);
      const CdtDbtInd = parseFloat(row['Amount']) < 0 ? 'DBIT' : 'CRDT';
      Ntry.ele('CdtDbtInd', CdtDbtInd);
      const NtryDtls = Ntry.ele('NtryDtls');
      const TxDtls = NtryDtls.ele('TxDtls');
      TxDtls.ele('Refs').ele('AcctSvcrRef', row['Reference']);
      TxDtls.ele('RmtInf').ele('Ustrd', row['Description']);
      const RltdPties = TxDtls.ele('RltdPties');
      RltdPties.ele('Dbtr').ele('Nm', row['Payer']);
      RltdPties.ele('DbtrAcct').ele('Id').ele('IBAN', row['Beneficiary IBAN']);

      endBalance += amount;
    }
  })
  .on('end', () => {
    // Add start balance entry
    const startBal = Stmt.ele('Bal');
    startBal.ele('Tp').ele('CdOrPrtry').ele('Cd', 'OPBD');
    startBal.ele('Amt').att('Ccy', 'USD').text(startBalance.toFixed(2));
    startBal.ele('CdtDbtInd', startBalance >= 0 ? 'CRDT' : 'DBIT');
    startBal.ele('Dt').ele('DtTm', new Date().toISOString());

    // Add end balance entry
    const endBal = Stmt.ele('Bal');
    endBal.ele('Tp').ele('CdOrPrtry').ele('Cd', 'CLBD');
    endBal.ele('Amt').att('Ccy', 'USD').text(endBalance.toFixed(2));
    endBal.ele('CdtDbtInd', endBalance >= 0 ? 'CRDT' : 'DBIT');
    endBal.ele('Dt').ele('DtTm', new Date().toISOString());

    const xmlString = root.end({
      pretty: true
    });
    fs.writeFileSync(outputFile, xmlString);
    console.log(`CAMT.053 XML file generated: ${outputFile}`);
  });
