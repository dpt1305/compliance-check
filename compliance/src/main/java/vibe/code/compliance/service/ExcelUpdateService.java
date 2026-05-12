package vibe.code.compliance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import vibe.code.compliance.dto.AiValidationResult;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class ExcelUpdateService {

    private final ResourceLoader resourceLoader;
    private final ObjectMapper objectMapper;

    @Value("${excel.update.path:}")
    private String updateFilePath;

    public void updateExcelAfterSubmission(String submissionType, String validationResultJson) {
        if (updateFilePath == null || updateFilePath.isBlank()) {
            log.debug("Excel update path not configured, skipping Excel update");
            return;
        }

        try {
            AiValidationResult result = objectMapper.readValue(validationResultJson, AiValidationResult.class);

            String deviceSerial = result.deviceSerial();
            String deviceName = result.deviceName();

            log.info("Attempting to update Excel file - DeviceSerial: {}, DeviceName: {}, Type: {}",
                    deviceSerial, deviceName, submissionType);
            log.info("Excel path configured: {}", updateFilePath);

            if ((deviceSerial == null || deviceSerial.isBlank()) && (deviceName == null || deviceName.isBlank())) {
                log.warn("No device serial or name extracted from image, skipping Excel update");
                return;
            }

            // Resolve file path (can be classpath: or file system path)
            Path excelPath = resolveFilePath(updateFilePath);
            if (excelPath == null || !Files.exists(excelPath)) {
                log.warn("Excel file not found at: {} (resolved path: {})", updateFilePath, excelPath);
                return;
            }

            log.info("Excel file found at: {}", excelPath);
            updateExcelFile(excelPath, deviceSerial, deviceName, submissionType, result);
        } catch (Exception e) {
            log.error("Failed to update Excel file: {}", e.getMessage(), e);
        }
    }

    private Path resolveFilePath(String filePath) throws Exception {
        if (filePath.startsWith("classpath:")) {
            // Copy from resources to temp location
            String resourcePath = filePath.replace("classpath:", "");
            Resource resource = resourceLoader.getResource("classpath:" + resourcePath);
            if (resource.exists()) {
                Path tempPath = Paths.get(System.getProperty("java.io.tmpdir"), "excel-update-temp.xlsx");
                Files.copy(resource.getInputStream(), tempPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                return tempPath;
            }
        } else {
            return Paths.get(filePath);
        }
        return null;
    }

    private void updateExcelFile(Path filePath, String extractedSerial, String extractedName, String submissionType, AiValidationResult result) {
        try (FileInputStream fis = new FileInputStream(filePath.toFile());
             Workbook workbook = new XSSFWorkbook(fis)) {

            Sheet sheet = workbook.getSheetAt(0);
            boolean updated = false;

            for (Row row : sheet) {
                if (row.getRowNum() == 0) continue; // skip header

                String excelSerial = getCellValue(row, 4); // Column E: Serial Number
                String excelName = getCellValue(row, 2);   // Column C: Name
                String excelMail = getCellValue(row, 3);   // Column D: Mail NCS

                // Match by extracted device serial or name
                if (matchesDevice(extractedSerial, extractedName, excelSerial, excelName, excelMail)) {
                    updateColumnsForRow(row, submissionType, result);
                    updated = true;
                    log.info("Updated Excel row for extracted device - Serial: {}, Name: {}", extractedSerial, extractedName);
                    break;
                }
            }

            if (updated) {
                try (FileOutputStream fos = new FileOutputStream(filePath.toFile())) {
                    workbook.write(fos);
                    log.info("Excel file updated successfully: {}", filePath);
                }
            } else {
                log.warn("No matching row found in Excel for extracted device - Serial: {}, Name: {}", extractedSerial, extractedName);
            }
        } catch (Exception e) {
            log.error("Error updating Excel file: {}", e.getMessage(), e);
        }
    }

    private boolean matchesDevice(String extractedSerial, String extractedName, String excelSerial, String excelName, String excelEmail) {
        // Priority 1: Match by extracted serial number (most reliable)
        if (extractedSerial != null && !extractedSerial.isBlank()) {
            String search = extractedSerial.toLowerCase().trim();
            if (excelSerial != null && excelSerial.toLowerCase().trim().equals(search)) {
                log.info("Matched by extracted serial number: {}", extractedSerial);
                return true;
            }
        }

        // Priority 2: Match by extracted device name
        if (extractedName != null && !extractedName.isBlank()) {
            String search = extractedName.toLowerCase().trim();
            if (excelName != null && excelName.toLowerCase().trim().equals(search)) {
                log.info("Matched by extracted device name: {}", extractedName);
                return true;
            }
        }

        // Priority 3: Partial matches
        if (extractedSerial != null && !extractedSerial.isBlank()) {
            String search = extractedSerial.toLowerCase().trim();
            if (excelSerial != null && excelSerial.toLowerCase().contains(search)) {
                log.info("Partial matched by extracted serial: {}", extractedSerial);
                return true;
            }
            if (excelEmail != null && excelEmail.toLowerCase().contains(search)) {
                log.info("Partial matched by email: {}", excelEmail);
                return true;
            }
        }

        return false;
    }

    private void updateColumnsForRow(Row row, String submissionType, AiValidationResult result) {
        // Columns to update:
        // Column 6 (G): Malware Alerts
        // Column 7 (H): Compliance Checks/Trellix
        // Column 8 (I): SEED Configuration
        // Column 9 (J): Operating System

        // Check if SEED dashboard values were extracted by AI
        if (result.seedDashboard() != null) {
            String malwareAlerts = result.seedDashboard().malwareAlerts() != null ?
                    result.seedDashboard().malwareAlerts() : "0 actions";
            String complianceChecks = result.seedDashboard().complianceChecks() != null ?
                    result.seedDashboard().complianceChecks() : "0 actions";
            String seedConfig = result.seedDashboard().seedConfiguration() != null ?
                    result.seedDashboard().seedConfiguration() : "0 actions";
            String operatingSystem = result.seedDashboard().operatingSystem() != null ?
                    result.seedDashboard().operatingSystem() : "0 actions";

            setCellValue(row, 6, malwareAlerts);
            setCellValue(row, 7, complianceChecks);
            setCellValue(row, 8, seedConfig);
            setCellValue(row, 9, operatingSystem);
            log.debug("Updated SEED dashboard values from AI extraction for device: {}", submissionType);
        } else if (hasSeedDashboard(result)) {
            // Fallback: extract from validation reason if not structured
            String malwareAlerts = extractSeedValue(result, "malware");
            String complianceChecks = extractSeedValue(result, "compliance");
            String seedConfig = extractSeedValue(result, "seed");
            String operatingSystem = extractSeedValue(result, "os");

            setCellValue(row, 6, malwareAlerts);
            setCellValue(row, 7, complianceChecks);
            setCellValue(row, 8, seedConfig);
            setCellValue(row, 9, operatingSystem);
            log.debug("Updated SEED dashboard values from fallback extraction for device: {}", submissionType);
        } else {
            // No SEED dashboard: put "Trellix" in all 4 columns (Windows/Thin with Trellix)
            setCellValue(row, 6, "Trellix");
            setCellValue(row, 7, "Trellix");
            setCellValue(row, 8, "Trellix");
            setCellValue(row, 9, "Trellix");
            log.debug("Updated Trellix values for device: {}", submissionType);
        }
    }

    private boolean hasSeedDashboard(AiValidationResult result) {
        // Check if SEED dashboard is mentioned in the validation result
        if (result == null || result.reason() == null) return false;
        return result.reason().toLowerCase().contains("seed");
    }

    private String extractSeedValue(AiValidationResult result, String type) {
        // Extract counter values from SEED dashboard in the validation reason
        // SEED dashboard typically shows: "Malware Alerts: X", "Compliance Checks: Y", etc.

        if (result == null || result.reason() == null) {
            return "0 actions";
        }

        String reason = result.reason().toLowerCase();

        try {
            return switch (type.toLowerCase()) {
                case "malware" -> extractNumber(result.reason(), "malware", "0 actions");
                case "compliance" -> extractNumber(result.reason(), "compliance", "0 actions");
                case "seed" -> extractNumber(result.reason(), "seed|configuration", "0 actions");
                case "os" -> extractNumber(result.reason(), "operating system|os", "0 actions");
                default -> "0 actions";
            };
        } catch (Exception e) {
            log.debug("Could not extract SEED value for type: {}, using default", type);
            return "0 actions";
        }
    }

    private String extractNumber(String text, String keyword, String defaultValue) {
        // Try to find a number pattern near the keyword
        // Example: "Malware Alerts: 5 threats" -> "5" or "5 actions" or "5 threats"
        if (text == null) return defaultValue;

        String lowerText = text.toLowerCase();
        String[] keywords = keyword.split("\\|");

        for (String kw : keywords) {
            int index = lowerText.indexOf(kw.toLowerCase());
            if (index >= 0) {
                // Look for a number after the keyword
                String after = text.substring(index + kw.length());
                java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\\d+");
                java.util.regex.Matcher matcher = pattern.matcher(after);
                if (matcher.find()) {
                    String number = matcher.group();

                    // Try to capture number with unit (e.g., "5 actions", "19 failed")
                    int numEnd = matcher.end();
                    String remaining = after.substring(numEnd);

                    // Look for a word after the number (unit)
                    java.util.regex.Pattern unitPattern = java.util.regex.Pattern.compile("\\s+(\\w+)");
                    java.util.regex.Matcher unitMatcher = unitPattern.matcher(remaining);

                    if (unitMatcher.find()) {
                        String unit = unitMatcher.group(1);
                        // Return "number unit" (e.g., "5 actions", "19 failed")
                        return number + " " + unit;
                    }

                    // Just return the number if no unit found
                    return number;
                }
            }
        }
        return defaultValue;
    }

    private String getCellValue(Row row, int colIndex) {
        Cell cell = row.getCell(colIndex, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (cell == null) return null;

        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> String.valueOf((long) cell.getNumericCellValue());
            default -> null;
        };
    }

    private void setCellValue(Row row, int colIndex, String value) {
        Cell cell = row.getCell(colIndex);
        if (cell == null) {
            cell = row.createCell(colIndex);
        }
        cell.setCellValue(value);
    }
}
