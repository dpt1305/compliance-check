# type-mapping.xlsx

Place `type-mapping.xlsx` in this directory with the following columns:

| submissionType | allowedImageTypes | description | exampleKeywords |
|---|---|---|---|
| laptop | jpg,jpeg,png,webp | Laptop or notebook computer | laptop,notebook,macbook,thinkpad |
| monitor | jpg,jpeg,png | Desktop monitor or display | monitor,display,screen |
| phone | jpg,jpeg,png,webp | Mobile phone | phone,smartphone,iphone,android |

If the file is missing at startup, the service will fall back to the default mappings above.
