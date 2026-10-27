# Synthetic fixtures

Every name, identifier, location, and value in this folder is invented for testing. These files do not describe a real organisation or a verified physical stocktake.

## Main handoff

Import `handoff-before.csv` and `handoff-after.csv`. Choose `Asset ID` as the before identifier and `Inventory ID` as the after identifier. Map these four fields explicitly:

| Receipt field | Before column | After column |
| ------------- | ------------- | ------------ |
| Item          | Item          | Description  |
| Location      | Location      | Storage      |
| Count         | Count         | Count        |
| Notes         | Notes         | Notes        |

The before file contains eight data records; the after file contains seven. Quoted newlines make physical line counts larger than record counts. Expected classification with the mapping above:

| Classification              | Count | Evidence                                                                                     |
| --------------------------- | ----: | -------------------------------------------------------------------------------------------- |
| Added                       |     1 | `0009` appears only after                                                                    |
| Removed                     |     1 | `0004` appears only before                                                                   |
| Changed                     |     2 | `0002`: Count; `0003`: Location and Notes                                                    |
| Unchanged                   |     2 | `0001` and `0008` match across all mapped fields                                             |
| Ambiguous identifier groups |     1 | Two before records use `0006`; the one after record is included in the same unresolved group |
| Invalid-key records         |     2 | One empty identifier in each source                                                          |

`0008` omits its trailing Notes cell in both files. It compares equal for that field as `null`, while the short records still make the overall comparison incomplete. A present empty cell would be `""`, a different value. Counts are literal CSV text; ChangeReceipt has not measured these quantities.

## Focused cases

- `malformed-quotes.csv`: an unclosed quoted field must reject the import.
- `duplicate-headers.csv`: a repeated header must reject the import.
- `formula-cells.csv`: formula-like and HTML-like strings must remain text in the interface. Convenience CSV exports must protect formula-like values; JSON retains the original strings.
- `missing-empty-before.csv` and `missing-empty-after.csv`: map Notes to Notes. Both identifiers change between missing and explicitly empty Notes values. Missing cells remain visible and the comparison is incomplete.

The fixtures may be opened directly from this repository or loaded through the application's synthetic example action. They are test inputs, not preapproved mappings.
