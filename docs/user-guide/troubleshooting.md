# Troubleshooting Guide

Common issues and solutions for Jack The Butler.

## Connection Issues

### Cannot access dashboard

**Symptoms:**
- Browser shows "Connection refused"
- Page doesn't load

**Solutions:**
1. Check if the server is running:
   ```bash
   docker ps  # For Docker
   # OR
   pnpm dev   # For local development
   ```
2. Verify the port is correct (default: 3000)
3. Check firewall rules allow the port
4. Check server logs for errors

### Database connection failed

**Symptoms:**
- Health check shows database error
- API returns 503 errors

**Solutions:**
1. Check DATABASE_PATH is set correctly
2. Verify the data directory exists and is writable
3. Check disk space
4. Try resetting the database (development only):
   ```bash
   rm data/jack.db
   pnpm db:migrate
   ```

## AI Provider Issues

### AI not responding

**Symptoms:**
- Messages don't get AI responses
- "AI service unavailable" errors

**Solutions:**
1. Check AI provider is configured and enabled in Integrations
2. Verify API key is correct
3. Test connection in dashboard
4. Check API rate limits
5. View logs for specific errors:
   ```bash
   docker logs jack | grep "ai"
   ```

### Slow AI responses

**Symptoms:**
- Messages take >10 seconds to respond
- Timeouts

**Solutions:**
1. Check API provider status page
2. Consider using a faster model
3. Enable response caching
4. Check network latency to API

## Channel Issues

### WhatsApp messages not received

**Symptoms:**
- Messages sent to WhatsApp don't appear
- No webhook events in logs

**Solutions:**
1. Verify webhook URL is correct in Meta dashboard
2. Check webhook verification token matches
3. Ensure server is publicly accessible (not localhost)
4. Check Meta webhook logs for errors
5. Verify access token is valid and not expired

### WhatsApp messages not sent

**Symptoms:**
- AI responds but guest doesn't receive
- Delivery errors in logs

**Solutions:**
1. Check WhatsApp access token
2. Verify phone number ID is correct
3. Check message template approval (for template messages)
4. Review Meta Business API logs

### SMS not working

**Symptoms:**
- No SMS sent or received

**Solutions:**
1. Verify Twilio credentials
2. Check phone number is SMS-enabled
3. Verify webhook URL in Twilio console
4. Check Twilio account balance

### Email issues

**Symptoms:**
- Emails not sent or received

**Solutions:**
1. Test SMTP connection independently
2. Check spam folder for sent emails
3. Verify IMAP polling is enabled
4. Check email provider sending limits

## Authentication Issues

### Cannot log in

**Symptoms:**
- Login fails with "Invalid credentials"

**Solutions:**
1. Verify email and password are correct
2. Check user account is active
3. Reset password if forgotten
4. Check if rate limited (wait 1 minute)

### Token expired

**Symptoms:**
- Logged out unexpectedly
- "Token expired" errors

**Solutions:**
1. Log in again
2. Check JWT_EXPIRES_IN setting
3. Ensure client clock is correct

## Performance Issues

### Slow dashboard

**Symptoms:**
- Dashboard loads slowly
- API requests timeout

**Solutions:**
1. Check server resource usage:
   ```bash
   docker stats jack
   ```
2. Review database size
3. Enable database indexes
4. Increase server resources

### High memory usage

**Symptoms:**
- Server crashes with OOM
- Memory keeps growing

**Solutions:**
1. Check for memory leaks in logs
2. Restart the server
3. Increase container memory limit
4. Review WebSocket connections

## Data Issues

### Conversations not appearing

**Symptoms:**
- New conversations don't show in dashboard

**Solutions:**
1. Refresh the page
2. Check WebSocket connection
3. Review channel webhook logs
4. Verify guest phone/email format

### PMS data not syncing

**Symptoms:**
- Guest data is outdated
- Reservations missing

**Solutions:**
1. Check PMS integration status
2. Trigger manual sync:
   ```bash
   curl -X POST http://localhost:3000/api/v1/admin/sync/pms
   ```
3. Review sync logs for errors
4. Verify PMS API credentials

## Automation Issues

### Rule not triggering

**Symptoms:**
- Scheduled message not sent
- Event-based rule not firing

**Solutions:**
1. Verify rule is enabled
2. Check trigger configuration
3. Review automation logs in dashboard
4. Check scheduler status:
   ```bash
   curl http://localhost:3000/health
   ```

### Wrong message sent

**Symptoms:**
- Template variables not replaced
- Wrong guest contacted

**Solutions:**
1. Check template configuration
2. Verify trigger data is correct
3. Test rule with dry-run
4. Review action logs

## Getting Support

### Collecting Debug Information

Before contacting support, gather:

1. **Server logs:**
   ```bash
   docker logs jack --tail 1000 > jack-logs.txt
   ```

2. **Health check:**
   ```bash
   curl http://localhost:3000/health > health.json
   curl http://localhost:3000/health/info > info.json
   curl http://localhost:3000/health/metrics > metrics.json
   ```

3. **Configuration (remove secrets):**
   ```bash
   env | grep -E "^(NODE_|PORT|DATABASE|LOG)" > config.txt
   ```

### Contact Support

- Documentation: https://jackthebutler.com/docs
- Issues: https://github.com/JackTheButler/JackTheButler/issues
- Email: support@jackthebutler.com

Include the following in your support request:
- Jack version number
- Relevant logs
- Steps to reproduce the issue
- Expected vs actual behavior
