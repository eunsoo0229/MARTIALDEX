package com.martialdex.testbuild;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * 게시물에 첨부된 링크를 "앱 안에서" 여는 진짜 목적을 만족시키는 화면 —
 * Chrome Custom Tabs(@capacitor/browser가 쓰는 방식)는 실제로는 Chrome 등
 * 별도 브라우저 앱이 기기에 설치되어 있어야 동작한다(그 앱이 백그라운드에서
 * 렌더링을 대신 해줌). 이 Activity는 그 대신 Android OS 자체에 내장된 시스템
 * 컴포넌트인 android.webkit.WebView만 사용하므로, 사용자에게 보이는 별도의
 * "브라우저 앱"이 기기에 하나도 없어도 동일하게 동작한다.
 */
public class InAppBrowserActivity extends AppCompatActivity {

    public static final String EXTRA_URL = "url";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra(EXTRA_URL);
        if (url == null || (!url.startsWith("http://") && !url.startsWith("https://"))) {
            finish();
            return;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        int dp8 = dp(8);
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp8, dp8, dp8, dp8);
        toolbar.setBackgroundColor(Color.parseColor("#1A1D24"));
        toolbar.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button closeButton = new Button(this);
        closeButton.setText("닫기");
        closeButton.setOnClickListener(v -> finish());
        toolbar.addView(closeButton);

        TextView urlLabel = new TextView(this);
        urlLabel.setText(url);
        urlLabel.setTextColor(Color.WHITE);
        urlLabel.setSingleLine(true);
        urlLabel.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        urlLabel.setPadding(dp8, 0, dp8, 0);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        urlLabel.setLayoutParams(labelParams);
        toolbar.addView(urlLabel);

        ProgressBar progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));
        progressBar.setVisibility(View.GONE);

        webView = new WebView(this);
        webView.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setLoadWithOverviewMode(true);
        webView.getSettings().setUseWideViewPort(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String loadingUrl) {
                // http/https stay inside this same WebView (never bounce out to a
                // separate browser/app). Anything else (tel:, mailto:, intent://,
                // market://, ...) is handed to the OS the normal way if some app
                // can handle it — never crashes if nothing can.
                if (loadingUrl.startsWith("http://") || loadingUrl.startsWith("https://")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(loadingUrl)));
                } catch (ActivityNotFoundException ignored) {
                    // No app can handle it (e.g. no dialer/email app) — silently
                    // stay on the current page rather than crashing.
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String pageUrl, android.graphics.Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                urlLabel.setText(pageUrl);
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                progressBar.setVisibility(View.GONE);
            }
        });

        root.addView(toolbar);
        root.addView(progressBar);
        root.addView(webView);
        setContentView(root);

        webView.loadUrl(url);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }
}
