import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';


export interface Files {
  time: string;
  ext: string;
  part: string; 
  fullname?: string | null;
}

export interface FileItem {
  device: string;
  date: string; // YYYY-MM-DD
  patient?: string | null;
  files: Files[];
}

export interface DevicePatientRecord {
  device: string;
  patient?: string | null;
  shimmer1?: string[] | null;
  shimmer2?: string[] | null;
  updatedAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = 'https://odb777ddnc.execute-api.us-east-2.amazonaws.com';

  constructor(private http: HttpClient) {}

  // Raw filenames (legacy)
  listFiles(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/files/`);
  }

  // New: rich metadata objects
  listFilesMetadata(): Observable<FileItem[]> {
    return this.http.get<FileItem[]>(`${this.baseUrl}/files/metadata/`);
  }

  // New: deconstructed files data
  listFilesDeconstructed(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/files/deconstructed/`);
  }

  // Back-compat for callers
  listFilesParsed(): Observable<FileItem[]> {
    return this.listFilesMetadata();
  }

  getDownloadUrl(filename: string): Observable<{ url: string }> {
    const params = new HttpParams().set('filename', filename);
    return this.http.get<{ url: string }>(`${this.baseUrl}/generate-download-url/`, { params });
  }

  getDownloadAllUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.baseUrl}/download-all-url/`);
  }

  buildDownloadAllUrl(): string {
    return `${this.baseUrl}/download-all-url/`;
  }

  buildDirectDownloadUrl(filename: string): string {
    return `${this.baseUrl}/download/${encodeURIComponent(filename)}`;
  }

  deleteFile(filename: string): Observable<void> {
    const params = new HttpParams().set('filename', filename);
    return this.http.delete<void>(`${this.baseUrl}/files/`, { params });
  }

  // DDB endpoints
  ddbGetDevicePatientMap(): Observable<DevicePatientRecord[]> {
    return this.http.get<DevicePatientRecord[]>(`${this.baseUrl}/ddb/device-patient-map`);
  }

  ddbPutDevicePatientMap(mapping: Record<string, string>): Observable<DevicePatientRecord[]> {
    return this.http.put<DevicePatientRecord[]>(`${this.baseUrl}/ddb/device-patient-map`, mapping);
    }

  ddbGetDevicePatientMapDetails(): Observable<DevicePatientRecord[]> {
    return this.http.get<DevicePatientRecord[]>(`${this.baseUrl}/ddb/device-patient-map/details`);
  }

  ddbGetDeviceMapping(device: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/ddb/device-patient-map/${encodeURIComponent(device)}`);
  }

  ddbPutDeviceMapping(device: string, payload: Record<string, any>): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/ddb/device-patient-map/${encodeURIComponent(device)}`, payload);
  }

  ddbDeleteDeviceMapping(device: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/ddb/device-patient-map/${encodeURIComponent(device)}`);
  }

  getUnregisteredDevices(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/devices/unregistered`);
  }

  listUniquePatients(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/patients`);
  }

  private parseFileName(name: string): FileItem {
    // Expected pattern: device_YYYYMMDD_HHMMSS_part.ext (part optional)
    const [device = '', ymd = '', hms = '', partExt = ''] = name.split('_');
    const lastDot = name.lastIndexOf('.');
    const ext = lastDot > -1 ? name.substring(lastDot + 1) : '';

    const yyyy = ymd.substring(0, 4);
    const mm = ymd.substring(4, 6);
    const dd = ymd.substring(6, 8);
    const date = yyyy && mm && dd ? `${yyyy}-${mm}-${dd}` : '';

    const hh = hms.substring(0, 2);
    const mi = hms.substring(2, 4);
    const ss = hms.substring(4, 6);
    const time = hh && mi && ss ? `${hh}:${mi}:${ss}` : '';

    const part = partExt?.includes('.') ? partExt.split('.')[0] : undefined;

    const files: Files[] = [{
      time,
      ext,
      part: part ?? '',
      fullname: name
    }];

    return {
      device,
      date,
      files
    };
  }

  decodeFile(filename: string) {
    return this.http.get<any>(
      `https://odb777ddnc.execute-api.us-east-2.amazonaws.com/file/decode/?filename=${encodeURIComponent(filename)}`
    );
  }

  // Combined metadata endpoint
  listFilesCombinedMeta(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/files/combined-meta/`);
  }

  // Get decoded field data for plotting
  getDecodedFieldDirect(fullFileName: string, fieldName: string): Observable<any> {
    const params = new HttpParams()
      .set('full_file_name', fullFileName)
      .set('field_name', fieldName);
    return this.http.get<any>(`${this.baseUrl}/get-decoded-field-direct/`, { params });
  }

  // Combined data files endpoints for dashboard
  getCombinedDataFiles(params?: { date?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.date) {
      httpParams = httpParams.set('date', params.date);
    }
    return this.http.get<any>(`${this.baseUrl}/combined-data-files/`, { params: httpParams });
  }

  getCombinedDataFile(filename: string): Observable<any> {
    const params = new HttpParams().set('filename', filename);
    return this.http.get<any>(`${this.baseUrl}/get-combined-data-file/`, { params });
  }

  getCombinedDataField(filename: string, fieldName: string): Observable<any> {
    const params = new HttpParams()
      .set('filename', filename)
      .set('field_name', fieldName);
    return this.http.get<any>(`${this.baseUrl}/get-combined-data-field/`, { params });
  }

  // Daily aggregator endpoint
  triggerDailyAggregator(payload?: { date?: string }): Observable<any> {
    const body: any = {};
    if (payload?.date) {
      body.date = payload.date;
    }
    return this.http.post<any>(`${this.baseUrl}/daily-aggregator/`, body);
  }

  getDecodedFileUrl(rawFileName: string): Observable<{ download_url: string; s3_key: string }> {
    const params = new HttpParams().set('full_file_name', rawFileName);
    return this.http.get<{ download_url: string; s3_key: string }>(`${this.baseUrl}/get-decoded-file-url/`, { params });
  }

  // Download zip by date endpoint
  downloadZipByDate(date: string): Observable<{ download_url: string; count: number }> {
    return this.http.get<{ download_url: string; count: number }>(`${this.baseUrl}/download-zip-by-date/${date}`);
  }
}
