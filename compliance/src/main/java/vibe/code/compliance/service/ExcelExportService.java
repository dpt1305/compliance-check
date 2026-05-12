package vibe.code.compliance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import vibe.code.compliance.model.Submission;
// import vibe.code.compliance.repository.SubmissionRepository; // COMMENTED OUT

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ExcelExportService {

    private static final DateTimeFormatter DT_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String[] HEADERS = {
            "ID", "Account", "Submission Type", "Status",
            "Image URL", "Saved Filename", "Submission Date", "Validation Result"
    };

    // private final SubmissionRepository submissionRepository; // COMMENTED OUT - Using JSON storage
    private final JsonStorageService jsonStorageService;

    public byte[] generateReport() throws IOException {
        List<Submission> submissions = jsonStorageService.findAll();

        try (Workbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = workbook.createSheet("Compliance Submissions");

            CellStyle headerStyle = buildHeaderStyle(workbook);
            CellStyle dateStyle = buildDateStyle(workbook);

            writeHeader(sheet, headerStyle);
            writeData(sheet, submissions, dateStyle);
            autoSizeColumns(sheet);

            workbook.write(out);
            return out.toByteArray();
        }
    }

    private void writeHeader(Sheet sheet, CellStyle style) {
        Row header = sheet.createRow(0);
        for (int i = 0; i < HEADERS.length; i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(HEADERS[i]);
            cell.setCellStyle(style);
        }
    }

    private void writeData(Sheet sheet, List<Submission> submissions, CellStyle dateStyle) {
        int rowIdx = 1;
        for (Submission s : submissions) {
            Row row = sheet.createRow(rowIdx++);
            row.createCell(0).setCellValue(s.getId());
            row.createCell(1).setCellValue(s.getAccount());
            row.createCell(2).setCellValue(s.getSubmissionType());
            row.createCell(3).setCellValue(s.getStatus().name());
            row.createCell(4).setCellValue(s.getImageUrl() != null ? s.getImageUrl() : "");
            row.createCell(5).setCellValue(s.getImageSavedName() != null ? s.getImageSavedName() : "");

            Cell dateCell = row.createCell(6);
            dateCell.setCellValue(s.getSubmissionDate() != null
                    ? s.getSubmissionDate().format(DT_FORMAT) : "");
            dateCell.setCellStyle(dateStyle);

            row.createCell(7).setCellValue(s.getValidationResult() != null ? s.getValidationResult() : "");
        }
    }

    private void autoSizeColumns(Sheet sheet) {
        for (int i = 0; i < HEADERS.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private CellStyle buildHeaderStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.LIGHT_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderBottom(BorderStyle.THIN);
        return style;
    }

    private CellStyle buildDateStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setWrapText(false);
        return style;
    }
}
