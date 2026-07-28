pipeline {
  agent any

  environment {
    S3_BUCKET       = 'rocky-interface-test'
    REGION          = 'ap-northeast-1'
    REPO_URL        = 'https://github.com/Rocky-exchange/rocky.interface.git'
    BRANCH          = 'dev'
    DEPLOY_ENV      = 'test'
    DEPLOY_HOST     = 'app.rockytest.xyz'
    LARK_APP_ID     = 'cli_aae9933123e15e18'
    LARK_CHAT_ID    = 'oc_58d8c20de2d1582d7ee870f8d2f95a4c'
    LARK_APP_SECRET = credentials('lark-app-secret')
    HEADER_TITLE    = '前端构建'
    ITEMS_HEADER    = '构建步骤'
    // Vite build-time env
    VITE_WALLET_CONNECT_PROJECT_ID = 'a4dd35e09ae6dbb12fdaef67ddd629ec'
    VITE_USE_SAME_ORIGIN_PROXY     = 'true'
    VITE_CONSOLE_WALLET_TARGET     = 'combined'
  }

  options {
    disableConcurrentBuilds(abortPrevious: true)
    timeout(time: 40, unit: 'MINUTES')
    ansiColor('xterm')
  }

  triggers { githubPush() }

  stages {
    stage('Checkout') {
      steps {
        git branch: "${BRANCH}", credentialsId: 'github-https', url: "${REPO_URL}"
        script {
          env.IMAGE_TAG = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.BUILD_START_EPOCH = sh(script: 'date +%s', returnStdout: true).trim()
          def cz = (currentBuild.buildCauses && currentBuild.buildCauses.size() > 0) ? currentBuild.buildCauses[0] : [:]
          def who = (cz['_class'] ?: '').toString().contains('UserIdCause') ? (cz['userName'] ?: 'User').toString() : 'System/Auto'
          env.TRIGGER = "${who} · ${(cz['shortDescription'] ?: '').toString()}"
          env.S1 = 'running'
          env.MSG_ID = sh(returnStdout: true, script: 'SVC="检出代码:running,安装依赖:created,前端构建:created,上传S3:created" PHASE=deploying COMMIT="$IMAGE_TAG" python3 lark_notify.py').trim()
          echo "Lark card message_id=${env.MSG_ID}"
        }
      }
    }

    stage('Build') {
      steps {
        sh '''
          set -e
          cat > .env <<EOF
VITE_WALLET_CONNECT_PROJECT_ID=$VITE_WALLET_CONNECT_PROJECT_ID
VITE_USE_SAME_ORIGIN_PROXY=$VITE_USE_SAME_ORIGIN_PROXY
VITE_CONSOLE_WALLET_TARGET=$VITE_CONSOLE_WALLET_TARGET
EOF
          echo "===> yarn install"
          yarn install --frozen-lockfile --ignore-engines
          # 安装完成打勾
          SVC="检出代码:running,安装依赖:running,前端构建:created,上传S3:created" PHASE=deploying MESSAGE_ID="$MSG_ID" COMMIT="$IMAGE_TAG" python3 lark_notify.py >/dev/null 2>&1 || true
          echo "===> yarn build"
          rm -rf build node_modules/.cache 2>/dev/null || true
          yarn build
          [ -d build ] || { echo "build/ not produced"; exit 1; }
          SVC="检出代码:running,安装依赖:running,前端构建:running,上传S3:created" PHASE=deploying MESSAGE_ID="$MSG_ID" COMMIT="$IMAGE_TAG" python3 lark_notify.py >/dev/null 2>&1 || true
        '''
      }
    }

    stage('Upload to S3') {
      steps {
        sh '''
          set -e
          aws s3 sync build/ "s3://$S3_BUCKET/" --delete --region "$REGION"
          SVC="检出代码:running,安装依赖:running,前端构建:running,上传S3:running" PHASE=deploying MESSAGE_ID="$MSG_ID" COMMIT="$IMAGE_TAG" python3 lark_notify.py >/dev/null 2>&1 || true
        '''
      }
    }
  }

  post {
    success {
      sh '''
        S=$(( $(date +%s) - ${BUILD_START_EPOCH:-$(date +%s)} )); DUR="$((S/60))m $((S%60))s"
        SVC="检出代码:running,安装依赖:running,前端构建:running,上传S3:running" PHASE=success DURATION="$DUR" MESSAGE_ID="$MSG_ID" COMMIT="$IMAGE_TAG" python3 lark_notify.py >/dev/null 2>&1 || true
      '''
    }
    failure {
      sh '''
        S=$(( $(date +%s) - ${BUILD_START_EPOCH:-$(date +%s)} )); DUR="$((S/60))m $((S%60))s"
        SVC="检出代码:${S1:-created},安装依赖:${S2:-created},前端构建:${S3:-created},上传S3:${S4:-created}" PHASE=failure DURATION="$DUR" MESSAGE_ID="$MSG_ID" COMMIT="$IMAGE_TAG" python3 lark_notify.py >/dev/null 2>&1 || true
      '''
    }
  }
}
