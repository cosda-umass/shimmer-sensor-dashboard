import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { fetchAuthSession } from '@aws-amplify/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-data-ops',
  standalone: false,
  templateUrl: './data-ops.html',
  styleUrls: ['./data-ops.css']
})
export class DataOps implements OnInit {
  // Modal state for future features
  showModal = false;
  notifMessage = '';
  notifType: 'success' | 'error' = 'success';
  private notifTimer?: any;

  // Download zip by date
  selectedDate: string = '';
  isDownloading = false;
  downloadResult: { download_url: string; count: number } | null = null;
  downloadError: string = '';

  constructor(private api: ApiService, private router: Router) {}

  async checkAuth() {
    try {
      const session = await fetchAuthSession();
      const isAuth = session?.tokens?.idToken ? true : false;
      if (!isAuth) this.router.navigate(['/login']);
    } catch {
      this.router.navigate(['/login']);
    }
  }

  ngOnInit(): void {
    this.checkAuth();
    // Add any data loading logic here if needed
  }

  onLogout() {
    console.log('Logout event received from header component');
    // Handle any additional logout logic here
  }

  // Notification logic for future actions
  private toast(msg: string, type: 'success' | 'error') {
    this.notifMessage = msg;
    this.notifType = type;
    if (this.notifTimer) clearTimeout(this.notifTimer);
    this.notifTimer = setTimeout(() => { this.notifMessage = ''; }, 3000);
  }

  // Download zip by date
  downloadZipByDate() {
    if (!this.selectedDate) {
      this.downloadError = 'Please select a date';
      this.downloadResult = null;
      return;
    }

    // Validate date format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(this.selectedDate)) {
      this.downloadError = 'Invalid date format. Please use YYYY-MM-DD (e.g., 2025-12-14)';
      this.downloadResult = null;
      return;
    }

    this.isDownloading = true;
    this.downloadError = '';
    this.downloadResult = null;

    this.api.downloadZipByDate(this.selectedDate).subscribe({
      next: (response) => {
        this.downloadResult = response;
        this.isDownloading = false;
        this.toast(`Found ${response.count} files. Download link ready!`, 'success');
      },
      error: (err) => {
        console.error('Error downloading zip by date:', err);
        this.downloadError = err?.error?.detail || err?.message || 'Failed to download zip file';
        this.downloadResult = null;
        this.isDownloading = false;
        this.toast(this.downloadError, 'error');
      }
    });
  }

  clearDate() {
    this.selectedDate = '';
    this.downloadResult = null;
    this.downloadError = '';
  }
}

